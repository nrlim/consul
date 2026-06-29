# CONSUL Architecture & Data Contract

# Audit Klaim Data Contract

This document is the canonical contract for Audit Klaim, Claim Validation, Fees & Drugs, scoring, AI usage, API docs, and result UI.

## 1. Canonical input only

The product is not released yet, so consumers and producers must use one canonical shape. Do not add or preserve legacy duplicate keys.

### Procedure

```ts
{
  code?: string | null;
  name: string;
  category?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}
```

Forbidden aliases: `procedureName`, `description`, `price`, `claimedUnitPrice`, `claimedTotal`, `claimedPrice`, `procedureCode`, `serviceCode`.

### Medication / Farmalkes

```ts
{
  code?: string | null;
  name: string;
  genericName?: string;
  dosage?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  frequency?: string;
  duration?: string;
}
```

Forbidden aliases: `medicationName`, `price`, `claimedUnitPrice`, `claimedTotal`, `drugName`, `drugGenericName`.

### Diagnosis

```ts
{
  code: string;
  name: string;
  type: 'PRIMARY' | 'SECONDARY' | 'COMPLICATION';
  sequence: number;
}
```

`description` is not an input alias for diagnosis name.

### Supporting document

```ts
{
  type: 'LMA' | 'KTP' | 'KARTU ASURANSI' | 'SK KAMAR' | 'FORM KRONOLOGIS KECELAKAAN' | 'SURAT PERNYATAAN RAWAT INAP' | string;
  date?: string;
  conclusion?: string;
  url?: string;
  description?: string;
}
```

SnapText OCR document availability uses top-level `documents[]` entries. `document_metadata` is reserved for technical OCR metadata only. A required document is considered provided only when `documents[].type` resolves to the required type. Do not infer required document availability from unrelated invoice text.

## 2. Producers and consumers

Keep these files aligned whenever the contract changes:

- `src/lib/ai/types.ts`
- `src/app/dashboard/claim-review/components/PathwayWizard.tsx`
- `src/app/dashboard/claim-review/components/PathwayImportModal.tsx`
- `src/app/dashboard/claim-review/components/PathwayResultViewer.tsx`
- `src/app/api/v1/claims/map-json/route.ts`
- `src/lib/ocr-claim-payload.ts`
- `src/lib/snaptext/schema.json`
- `src/lib/snaptext/clean-result.ts`
- `src/lib/ai/drivers/openai-compatible.ts`
- `src/lib/ai/validators/tariff.ts`
- `src/lib/ai/validators/drug-price.ts`
- `src/lib/policy/validator.ts`
- `src/lib/fwa/triage.ts`
- `src/lib/evidence/gateway.ts`
- `src/lib/evidence/types.ts`
- `src/lib/evidence/clinical-reference-search.ts`
- `src/lib/hitl.ts`
- `src/app/dashboard/claim-review/components/AdjudicationPanel.tsx`
- `src/workflows/claim-validation/steps.ts`
- `public/swagger.json`
- sample payloads under `sample-data/clinical-pathway-score-demo/`

## 3. Tariff validation

Tariff validation uses local master fee schedule data only.

Resolution order:
1. If `procedure.code` is provided, match active tariff by exact `procedureCode` or `serviceCode` for the selected provider.
2. If code is absent, match exact procedure name against the provider's active master tariff.
3. If no match is found, emit `NOT_FOUND` and let scoring count it under master-data readiness.

Price fields:
- claimed unit price = `unitPrice`
- claimed total = `totalPrice` or `unitPrice * quantity` if total is omitted internally
- expected total = master max price × quantity

## 4. Medication / Farmalkes validation

Medication pricing must use local `MedicalItemPriceMaster` / master Farmalkes rows.

AI is allowed only as a local master-data matcher/resolver:
- input: claimed medication, diagnosis context, and local candidates
- output: selected local candidate id + confidence + reason
- AI must not estimate prices, search the internet, invent products, or provide market prices

Reference price selection uses the best meaningful local value:
1. `maxReferencePrice`
2. `hetPrice`
3. `marketPriceMax`
4. `fixPrice`

A meaningful price is `>= 100`.

## 5. Diagnosis validation behavior

Diagnosis-treatment validation must support multiple diagnoses in one claim episode:
- output includes one validation detail per claimed diagnosis
- procedure and medication review uses the full episode context, including primary, secondary, and complication diagnoses
- a procedure/medication should not be counted as an episode-level clinical mismatch if it is appropriate for at least one diagnosis in the episode
- audit klaim generation uses the primary diagnosis as the pathway driver while secondary/complication diagnoses inform monitoring, supportive care, risk review, and discharge criteria
- when local diagnosis-procedure mapping is absent or incomplete, AI clinical reasoning may use external medical references for this diagnosis/procedure analysis only; it must expose `clinicalEvidenceSummary`, `evidenceReferences`, and `evidenceRetrievalStatus`, and it must not affect tariff, drug pricing, policy, or FWA source rules

## 6. Policy & benefit validation

`outputResult.policyValidation` is the canonical policy engine result. It is deterministic and HITL-oriented.

```ts
{
  isValid: boolean;
  status: 'PASS' | 'WARNING' | 'REVIEW_NEEDED' | 'REJECT_RECOMMENDED';
  score: number;
  summary: string;
  findings: Array<{
    ruleCode: string;
    ruleName: string;
    ruleType: 'EXCLUSION' | 'LIMIT' | 'DEDUCTIBLE' | 'COPAY' | 'WAITING_PERIOD' | 'PRE_AUTH' | 'ROOM_ENTITLEMENT' | string;
    targetType?: string | null;
    targetCode?: string | null;
    severity: 'INFO' | 'WARNING' | 'REVIEW_NEEDED' | 'REJECT_RECOMMENDED';
    message: string;
    recommendation: string;
    evidence: Array<{ type: string; label: string; value: string }>;
    calculation?: {
      claimAmount: number;
      coveredAmount: number;
      excessAmount: number;
      deductibleAmount?: number;
      copayAmount?: number;
      limitAmount?: number;
    };
  }>;
  totals: {
    claimAmount: number;
    coveredAmount: number;
    excessAmount: number;
  };
  evaluatedRuleCount: number;
}
```

Rules may come from active `PolicyRule` master data for the client or from canonical integration payload `policyRules` for POC runs. Policy findings currently act as a non-deductive HITL gate in score breakdown: they can move final claim status to `WARNING` or `REVIEW_NEEDED`, but they do not reduce clinical/financial score points until product scoring governance is approved.

## 7. FWA risk triage

`outputResult.fwaRisk` is the canonical deterministic Fraud, Waste, Abuse risk result. It is a triage layer, not an automatic rejection engine.

```ts
{
  level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  score: number; // 0-100
  summary: string;
  signals: Array<{
    code: string;
    label: string;
    category: 'DUPLICATE' | 'UTILIZATION' | 'FINANCIAL' | 'CLINICAL' | 'DOCUMENT' | 'POLICY' | 'PROVIDER_PATTERN';
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    scoreImpact: number;
    evidence: string;
    recommendation: string;
  }>;
  evidenceSummary: {
    similarClaimCount: number;
    patientRecentClaimCount: number;
    providerAverageClaimAmount: number | null;
    providerMedianClaimAmount: number | null;
    providerHighRiskClaimCount: number;
  };
  isReviewRecommended: boolean;
}
```

FWA signals are deterministic and explainable. They may use current validation output plus scoped historical claim snapshots for duplicate/similar claim count, patient frequency, provider claim benchmark, and provider high-risk pattern. `HIGH` and `CRITICAL` FWA results can move final claim status to `REVIEW_NEEDED`; `MEDIUM` can move a previously valid claim to `WARNING`.

## 8. Local medical evidence packet

`outputResult.evidencePacket` is the canonical evidence snapshot for claim review. Default evidence remains local-only, but there is one explicit exception: diagnosis-procedure/diagnosis-medication clinical reasoning may include external medical references when local diagnosis mapping is absent or too shallow. CONSUL must not connect to MCP servers or scrape Google Scholar; references are produced by the configured AI model's medical reasoning/search capability and should cite authoritative source families honestly.

```ts
{
  generatedAt: string;
  sourcePolicy: 'LOCAL_ONLY' | 'LOCAL_WITH_DIAGNOSIS_EXTERNAL_EVIDENCE';
  summary: {
    totalEvidence: number;
    highConfidenceCount: number;
    categories: Array<'FWA' | 'POLICY' | 'TARIFF' | 'DRUG_PRICE' | 'DOCUMENT' | 'LOS' | 'DIAGNOSIS' | 'PATHWAY'>;
  };
  items: Array<{
    id: string;
    topic: string;
    category: string;
    source: 'FWA_ENGINE' | 'POLICY_RULE' | 'LOCAL_TARIFF_MASTER' | 'LOCAL_DRUG_MASTER' | 'CLAIM_DOCUMENT' | 'LOS_VALIDATOR' | 'DIAGNOSIS_VALIDATOR' | 'AI_MEDICAL_REASONING' | 'INTERNAL_PATHWAY';
    title: string;
    summary: string;
    evidenceText: string;
    recommendation: string;
    confidence: 'LOW' | 'MEDIUM' | 'HIGH';
    accessedAt: string;
    relatedCode?: string | null;
    amount?: number | null;
    references?: Array<{
      sourceType: 'INDONESIA_GUIDELINE' | 'WHO_GUIDELINE' | 'SPECIALTY_SOCIETY_GUIDELINE' | 'PUBMED' | 'COCHRANE' | 'CLINICAL_TRIALS' | 'FDA' | 'RXNORM' | 'AAP' | 'TOP_MEDICAL_JOURNAL' | 'GOOGLE_SCHOLAR' | 'OTHER';
      title: string;
      organization?: string | null;
      year?: string | null;
      url?: string | null;
      identifier?: string | null;
      relevance: string;
      strength: 'LOW' | 'MEDIUM' | 'HIGH';
    }>;
  }>;
}
```

Evidence packet generation is non-adjudicative: it supports reviewer explainability and auditability, but does not change score by itself. External references are allowed only for clinical diagnosis-procedure reasoning. CONSUL pre-fetches PubMed context using diagnosis/procedure/medication terms only and never includes patient identifiers. Preferred sources follow the medical-mcp source pattern without adopting MCP as a dependency: Indonesian Kemenkes/PNPK first when available, WHO/specialty guidelines, Cochrane, PubMed, ClinicalTrials.gov, FDA/RxNorm for medication nomenclature/safety, AAP for pediatric claims, and top journals such as NEJM/JAMA/Lancet/BMJ/Nature Medicine. Google Scholar is discovery-only and must not be the sole adjudication source. The HITL packet stores this evidence snapshot with reviewer decisions.

## 9. HITL review and adjudication

Reviewer decisions are stored separately from AI validation output in `snp_claim_review_decision`. Do not mutate `inputPayload` or `outputResult` to represent manual adjudication.

Canonical review decision record:

```ts
{
  jobId: string;
  decision: 'APPROVE' | 'APPROVE_WITH_ADJUSTMENT' | 'REJECT' | 'REQUEST_DOCUMENTS' | 'ESCALATE_MEDICAL_ADVISOR';
  reviewStatus: 'IN_REVIEW' | 'DECIDED' | 'WAITING_DOCUMENTS' | 'ESCALATED';
  payableAmount?: number | null;
  excessAmount?: number | null;
  reasonCode?: string | null;
  note?: string | null;
  previousReviewStatus?: string | null;
  nextReviewStatus: string;
  hitlPacket?: {
    recommendedAction: string;
    summary: string;
    findings: Array<{ category: string; severity: string; message: string; recommendation: string; amount?: number }>;
    counts: Record<string, number>; // includes fwa, policy, tariff, drugPrice, document, los, diagnosis
    financialImpact: {
      claimAmount: number;
      policyExcessAmount: number;
      tariffVarianceAmount: number;
      drugVarianceAmount: number;
      recommendedPayableAmount: number;
    };
    evidencePacket: MedicalEvidencePacket;
  };
}
```

HITL queue eligibility is derived from completed claim validation jobs with validation status `WARNING`/`REVIEW_NEEDED`, non-`PASS` policy status, or generated HITL findings. The latest `ClaimReviewDecision` controls the displayed review status.

## 10. Scoring

Scoring starts at 100 and deducts proportionally by validation aspect.

Master-data readiness must be fair:
- total master-data denominator = number of claimed procedures + claimed medications
- missing ratio = missing procedure references + missing medication references / denominator
- deduction = master-data weight × missing ratio

Do not deduct the full master-data readiness weight for a single missing item unless it is the only procedure/medication item.

Items without master references are not mixed into price-compliance deductions. They are counted under master-data readiness.

## 11. LOS behavior

LOS validation compares actual LOS from encounter dates with expected LOS from the pathway/LOS estimator. LOS is a separate scoring dimension and only deducts when actual LOS exceeds the expected standard beyond configured tolerance.

## 12. Timeline behavior

Result UI should group pathway phases by canonical phase/day fields from pathway output. Do not infer grouping from provider-specific labels.

## 13. Safe-change checklist

Latest contract update: supporting document availability from SnapText OCR is represented directly by canonical top-level `documents[]` entries with `type`, `date`, and `conclusion`; `document_metadata` is technical metadata only.

Before changing this contract:
1. Update all producers/consumers listed above.
2. Update API docs and samples.
3. Run `npx prisma generate` if schema/client types changed.
4. Run `npx tsc --noEmit --pretty false`.
5. Run `npm run build`.


---

# Historical Context: Market POC Implementation Plan

# CONSUL Market POC Implementation Plan

## 1. Context and Product Direction

CONSUL is positioned as a general-purpose AI-assisted claim review and audit klaim validation platform for insurers, TPAs, hospital groups, and enterprise healthcare payers. The product must not be built as a single-client custom workflow. Client-specific requirements should be handled through configurable adapters, policy rules, provider master data, and integration settings.

Document extraction is not part of CONSUL's core build scope because extraction is handled by SnapText (`https://snaptextid.vercel.app/`). SnapText produces structured JSON outputs, including tariff book extraction results already represented under `sample-data/master-data-docs/`. CONSUL consumes those structured outputs and turns them into validated master data, claim review evidence, recommendations, and human review workflows.

## 2. Scope Boundaries

### In Scope for CONSUL

- JSON ingestion from external extraction platforms such as SnapText.
- Universal tariff master normalization.
- Claim validation against tariff master data.
- Drug pricing validation against local/reference drug price database.
- Clinical review of diagnosis, procedure, medication, and LOS.
- Policy and benefit rule validation.
- Fraud, Waste, and Abuse signal detection.
- Risk scoring and review prioritization.
- Human-in-the-loop review workflow.
- Explainable recommendation packet generation.
- Provider and claim monitoring dashboards.
- Integration APIs and audit-ready logs.

### Out of Scope for CONSUL Core

- Building a new OCR/PDF extraction engine.
- Replacing SnapText extraction workflows.
- Client-specific hardcoded policy logic.
- Manual one-off provider mapping outside configurable master data templates.
- Model training using client data without explicit product governance.

## 3. Product Principles

1. **Client-agnostic by default**: Features must work for any payer, insurer, TPA, or provider network through configuration.
2. **Evidence-first recommendations**: Every recommendation must link to claim items, master data, policy rule, medical rationale, or document evidence.
3. **Human decision ownership**: AI recommends; human reviewers approve, reject, override, or escalate.
4. **Deterministic where possible**: Tariff, drug price, policy, benefit, duplicate billing, and eligibility checks should be rule-based before AI reasoning.
5. **AI as clinical reasoning layer**: AI should explain medical necessity, clinical relevance, and ambiguous context; it should not invent pricing or policy rules.
6. **Auditability**: Every claim result must be reproducible, versioned, and exportable for audit.
7. **Provider analytics ready**: Every validation result should contribute to provider-level cost, utilization, and risk metrics.

## 4. Target Architecture

```text
SnapText / External Extractor
        |
        v
Structured JSON Documents
        |
        v
CONSUL Ingestion & Normalization
        |
        +--> Universal Tariff Master
        +--> Drug/Farmalkes Master
        +--> Policy & Benefit Rules
        +--> Claim Input Contract
        |
        v
Validation Engines
        |
        +--> Fee Schedule Validation
        +--> Drug Price Validation
        +--> Medical Pathway Review
        +--> LOS Review
        +--> Policy / Exclusion / Excess Review
        +--> FWA Detection
        +--> Document & Identity Consistency Review
        |
        v
Risk Scoring + Recommendation Packet
        |
        v
HITL Review Workbench
        |
        v
Decision API / Callback / Export / Audit Packet
```

## 5. Phase 0 — Foundation Alignment

### Goal

Prepare the platform to support market-grade payer workflows without hardcoding a specific client.

### Workstreams

- Define canonical master data contracts:
  - provider tariff master,
  - drug/farmalkes price master,
  - policy and benefit rule master,
  - claim validation input,
  - recommendation output,
  - HITL decision record.
- Define client and provider tenancy boundaries.
- Define feature flags per client/product line.
- Define audit event taxonomy.
- Define result severity levels:
  - `PASS`,
  - `INFO`,
  - `WARNING`,
  - `NEEDS_REVIEW`,
  - `REJECT_RECOMMENDED`,
  - `AUTO_PASS_CANDIDATE`.

### Deliverables

- Canonical data contracts.
- POC configuration model.
- Audit event model.
- Risk severity taxonomy.

### Acceptance Criteria

- New clients can be onboarded without changing validation code.
- Provider and policy data can be scoped by client.
- Claim result can explain which rules and master data versions were used.

## 6. Phase 1 — Master Data Ingestion from SnapText JSON

### Goal

Consume structured JSON generated by SnapText and normalize it into reusable CONSUL master data.

### Feature: Master Data Import Workbench

#### Capabilities

- Upload/import structured JSON from SnapText.
- Detect source document type:
  - tariff book,
  - drug price list,
  - policy terms,
  - provider contract appendix,
  - claim invoice extraction.
- Map extracted rows into universal templates.
- Show confidence and issue flags from extraction metadata.
- Allow reviewer correction before publishing master data.
- Version imported master data by provider, client, effective date, and source document.

#### Tariff Master Template

Recommended normalized fields:

```ts
{
  providerCode: string;
  providerName: string;
  serviceCode?: string | null;
  procedureCode?: string | null;
  procedureName: string;
  category?: string | null;
  subcategory?: string | null;
  unit?: string | null;
  roomClass?: string | null;
  basePrice: number;
  maxPrice: number;
  currency: 'IDR';
  effectiveFrom: string;
  effectiveTo?: string | null;
  sourceDocumentId: string;
  extractionConfidence?: number;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
}
```

### Deliverables

- `MasterDataImport` module.
- Tariff JSON normalizer for SnapText outputs.
- Import preview UI.
- Publish/rollback version controls.
- Master data issue report.

### Acceptance Criteria

- JSON files under `sample-data/master-data-docs/` can be normalized into tariff master format.
- Import shows rows with missing service name, missing price, duplicate service code, or low confidence.
- Published tariff rows are immediately consumable by claim validation.

## 7. Phase 2 — Financial Validation Engines

### Goal

Validate claim invoice items against normalized master data and return item-level and aggregate financial variance.

### Feature: Fee Schedule Validation

#### Capabilities

- Match claim procedures/services to provider tariff master.
- Support exact code matching and controlled name matching fallback.
- Calculate:
  - item claim total,
  - item master total,
  - item variance percentage,
  - item variance amount,
  - aggregate claim total,
  - aggregate master total,
  - aggregate variance.
- Flag:
  - overpricing,
  - underpricing,
  - unregistered service,
  - duplicate service,
  - package mismatch.

### Feature: Drug Price Validation

#### Capabilities

- Match drug/farmalkes items to local drug price master.
- Use deterministic reference prices only.
- Calculate item and aggregate variance.
- Flag:
  - overpricing,
  - underpricing,
  - missing reference,
  - non-drug/farmalkes item,
  - supplement/vitamin category.

### Deliverables

- Enhanced result table and summary cards.
- Item-level variance evidence.
- Aggregate variance evidence.
- Validation summary for HITL.

### Acceptance Criteria

- A claim invoice item with price above master tariff shows variance and recommendation.
- Drug price mismatch shows item and total variance.
- Missing master data does not incorrectly reduce price compliance; it is categorized as master-data readiness.

## 8. Phase 3 — Medical Pathway and Clinical Necessity Review

### Goal

Review medical necessity and clinical consistency across diagnosis, procedure, medication, and LOS for real payer workflows.

### Feature: Multi-Diagnosis Clinical Review

#### Capabilities

- Validate all diagnoses in the claim episode:
  - primary diagnosis,
  - secondary diagnosis,
  - complication diagnosis.
- Assess each procedure and medication in episode context.
- Avoid penalizing an item if it is clinically justified by at least one diagnosis.
- Produce per-diagnosis clinical summary.
- Produce episode-level recommendation.

### Feature: LOS Review

#### Capabilities

- Compare actual LOS against estimated/pathway LOS.
- Consider diagnosis complexity and comorbidity context.
- Flag overstay, understay, missing LOS, and clinical justification gaps.

### Feature: Clinical Recommendation Summary

Recommended output sections:

- diagnosis-procedure consistency,
- diagnosis-medication consistency,
- diagnosis-LOS consistency,
- missing required clinical evidence,
- clinical risk level,
- recommendation:
  - approve candidate,
  - pending document/clarification,
  - medical review required,
  - reject recommended.

### Deliverables

- Multi-diagnosis AI review prompt and schema.
- Episode-level scoring logic.
- Clinical result UI updates.
- Clinical evidence links.

### Acceptance Criteria

- A claim with multiple diagnoses produces one review detail per diagnosis.
- A procedure relevant to any diagnosis is not counted as an episode mismatch.
- Pathway recommendation uses primary diagnosis as driver and secondary/complication diagnoses as care context.

## 9. Phase 4 — Policy, Benefit, and Terms & Conditions Engine

### Goal

Add payer policy validation so CONSUL can support real insurance decisioning beyond medical and price review.

### Feature: Policy Rule Engine

#### Rule Types

- Diagnosis exclusion.
- Procedure exclusion.
- Drug/vitamin/supplement exclusion.
- Waiting period.
- Pre-existing condition rule.
- Room entitlement.
- Benefit limit.
- Deductible.
- Co-pay.
- Excess claim calculation.
- Pre-authorization requirement.
- Coverage by policy product.

### Recommended Rule Model

```ts
{
  clientId: string;
  policyProductCode: string;
  ruleCode: string;
  ruleName: string;
  ruleType: 'EXCLUSION' | 'LIMIT' | 'DEDUCTIBLE' | 'COPAY' | 'WAITING_PERIOD' | 'PRE_AUTH' | 'ROOM_ENTITLEMENT';
  conditionJson: unknown;
  actionJson: unknown;
  effectiveFrom: string;
  effectiveTo?: string | null;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
}
```

### Deliverables

- Policy master UI.
- Rule evaluator.
- Policy validation result section.
- Excess calculation summary.
- Policy evidence in recommendation packet.

### Acceptance Criteria

- Excluded diagnosis triggers policy flag.
- Excluded supplement/vitamin triggers policy flag.
- Benefit limit/excess can calculate payable vs excess amount.
- Reviewer can see exact policy rule behind a recommendation.

## 10. Phase 5 — HITL Review Workbench and Recommendation Packet

### Goal

Provide an operational workflow where reviewers can make final claim decisions using CONSUL recommendations.

### Feature: Human Review Queue

#### Capabilities

- Claim review queue with priority.
- Assignment to reviewer/team.
- Filter by provider, risk, status, amount, policy product, date.
- Reviewer comments.
- Override recommendation.
- Escalation.
- Final decision:
  - approve,
  - approve with adjustment,
  - pending documents,
  - reject,
  - escalate.

### Feature: Recommendation Packet

Each packet should include:

- final recommendation,
- risk score,
- financial variance,
- clinical findings,
- policy findings,
- document findings,
- FWA findings,
- evidence references,
- model/rule version,
- processing latency,
- reviewer decision history.

### Feature: Result Delivery API

Recommended resources:

```text
POST /api/v1/claims
GET  /api/v1/claims/{claimId}/result
GET  /api/v1/review-tasks
PATCH /api/v1/review-tasks/{taskId}
POST /api/v1/review-tasks/{taskId}/decision
POST /api/v1/callbacks/claim-results
```

### Deliverables

- HITL workbench UI.
- Review task model.
- Decision history and comments.
- Recommendation packet API.
- Processing time per claim and batch.

### Acceptance Criteria

- A high-risk claim appears in review queue with reasons.
- Reviewer can approve/reject/override with mandatory reason.
- Final decision is stored with full audit trail.
- Result can be delivered through API/callback.

## 11. Phase 6 — Error Analysis and Document Consistency

### Goal

Detect document-level risks and extraction quality issues after SnapText has produced JSON.

### Feature: Extraction Quality Review

#### Capabilities

- Consume SnapText confidence metadata.
- Flag unreadable or missing fields.
- Flag incomplete invoice totals.
- Flag table extraction ambiguity.
- Flag low-confidence patient identity fields.

### Feature: Identity Consistency Check

#### Capabilities

- Detect different patient names/IDs across invoice, medical report, insurance card, and supporting documents.
- Detect multiple patients in one extraction bundle.
- Flag mismatched dates of service, admission dates, and policy numbers.

### Deliverables

- Document quality result section.
- Identity mismatch result section.
- HITL recommendation for manual verification.

### Acceptance Criteria

- Claim is flagged if patient identity differs across extracted documents.
- Low-confidence extracted fields appear as review items.
- Reviewer can see which document/source caused the flag.

## 12. Phase 7 — Fraud, Waste, and Abuse Detection

### Goal

Detect abnormal billing and utilization patterns that require payer review.

### FWA Signals

- Duplicate billing.
- Same service repeated unusually in one episode.
- Same patient/provider/date duplicate claim.
- Overpriced service beyond provider tariff.
- Unbundling package and itemized service together.
- Repeated lab/imaging without clinical reason.
- Unusual room/LOS pattern.
- Provider-level cost outlier.
- Drug quantity or frequency outlier.

### Deliverables

- FWA signal engine.
- Risk signal registry.
- FWA result section.
- Provider-level aggregation.

### Acceptance Criteria

- Duplicate item in one invoice is detected.
- Package + component double billing is flagged.
- High-variance provider trend contributes to risk prioritization.

## 13. Phase 8 — Risk Triage and Smart Prioritization

### Goal

Reduce reviewer workload by ranking claims according to risk and business impact.

### Risk Dimensions

- Financial variance amount.
- Medical necessity risk.
- Policy exclusion risk.
- Missing document risk.
- FWA risk.
- Provider historical risk.
- Extraction quality risk.
- Claim amount exposure.

### Deliverables

- Unified risk score.
- Priority queue.
- Risk reason chips.
- SLA countdown for review tasks.

### Acceptance Criteria

- Claims are sorted by review priority.
- Reviewer can understand top risk drivers in one glance.
- Low-risk claims can be separated from high-risk manual review.

## 14. Phase 9 — Provider Analytics and Monitoring

### Goal

Provide payer/TPA teams with portfolio-level monitoring of provider behavior, cost trends, and claim quality.

### Dashboard Views

- Provider cost trend.
- Top services with overpricing variance.
- LOS outliers by diagnosis/provider.
- Drug price variance by provider.
- FWA signal frequency.
- Claim approval/pending/rejection trend.
- Reviewer productivity.
- Average processing time per claim and batch.

### Deliverables

- Provider analytics dashboard.
- CSV export.
- Scheduled report.
- Drilldown from provider trend to claim evidence.

### Acceptance Criteria

- User can identify providers with repeated high variance.
- User can drill from dashboard to claim-level evidence.
- Processing latency can be reported per claim and batch.

## 15. Phase 10 — AI Governance, Audit, and Compliance

### Goal

Make CONSUL ready for enterprise governance, audit, and regulator-facing review.

### Feature: Explainability and Evidence Trace

- Link every recommendation to source evidence.
- Show rule/model/prompt version.
- Show confidence level.
- Show reviewer override reason.

### Feature: Model Lifecycle Monitoring

- Accuracy tracking.
- False positive and false negative tracking.
- Prompt/model version history.
- Evaluation dataset snapshots.
- Drift monitoring.
- Human override analytics.

### Feature: Audit Packet Export

Audit packet should include:

- original claim payload,
- normalized claim payload,
- validation result,
- evidence links,
- policy rules used,
- tariff/drug master versions,
- AI/rule versions,
- reviewer decision history,
- activity logs.

### Acceptance Criteria

- Any claim decision can be reconstructed from stored evidence.
- Reviewer override is visible in audit history.
- Model/prompt/rule version used for decision is identifiable.

## 16. Phase 11 — Integration, Scalability, and Business Continuity

### Goal

Prepare CONSUL for client system integration and production-grade operation.

### Integration

- REST APIs for claim submission, batch submission, result retrieval, and callback delivery.
- Idempotency keys for claim/batch submissions.
- Pagination and filtering for review tasks and results.
- Webhook retry and delivery logs.
- API key + secret authentication.
- Tenant-scoped RBAC.

### Scalability

- Background job processing for batches.
- Queue-based claim validation.
- Batch progress tracking.
- Metrics for throughput, latency, errors, and retries.

### DR/BCP Readiness

- Backup and restore procedure.
- RPO/RTO targets.
- Environment separation.
- Audit log retention.
- Incident response process.

### Acceptance Criteria

- API supports single claim and batch claim processing.
- Each claim/batch has processing time metrics.
- Failed jobs can be retried without duplicate side effects.
- Integration consumers can poll or receive callback results.

## 17. Recommended POC Build Plan

### POC Sprint 1 — Master Data and Financial Validation

- SnapText JSON ingestion for tariff books.
- Universal tariff master normalization.
- Fee schedule validation.
- Drug price validation.
- Financial variance summary and item variance.

### POC Sprint 2 — Medical Review and LOS

- Multi-diagnosis clinical review.
- Diagnosis-procedure validation.
- Diagnosis-medication validation.
- LOS validation.
- Clinical recommendation summary.

### POC Sprint 3 — Policy and HITL

- Basic policy rule engine.
- Diagnosis exclusion.
- Drug/supplement/vitamin exclusion.
- Excess calculation.
- HITL review queue.
- Final decision workflow.

### POC Sprint 4 — Error Analysis and FWA

- Extraction quality flags from SnapText metadata.
- Identity consistency check.
- Duplicate billing detection.
- Overpricing and repeated service signals.
- Risk triage queue.

### POC Sprint 5 — Integration and Reporting

- Result API.
- Review decision API.
- Callback delivery.
- Claim/batch processing time metrics.
- Provider monitoring dashboard MVP.
- Audit packet export MVP.

## 18. POC Success Metrics

### Functional Metrics

- Tariff master import success rate.
- Claim item match rate against tariff master.
- Drug item match rate against drug price master.
- Policy rule hit accuracy.
- HITL completion rate.

### Operational Metrics

- Average processing time per claim.
- Average processing time per batch.
- Percentage auto-pass candidates.
- Percentage claims requiring manual review.
- Reviewer time saved per claim.

### Quality Metrics

- False positive rate for clinical review findings.
- False negative rate for missed overpricing or policy exclusion.
- Human override rate.
- Evidence completeness score.
- Extraction issue rate from SnapText JSON.

## 19. Recommended Product Modules

| Module | Purpose | Phase |
| --- | --- | --- |
| Master Data Import Workbench | Consume SnapText JSON and normalize master data | Phase 1 |
| Universal Tariff Master | Store provider tariff versions | Phase 1 |
| Fee Schedule Validator | Validate claim services against tariff master | Phase 2 |
| Drug Price Validator | Validate drug/farmalkes prices | Phase 2 |
| Clinical Review Engine | Diagnosis, procedure, medication, LOS review | Phase 3 |
| Policy & Benefit Engine | Exclusion, benefit, excess, entitlement rules | Phase 4 |
| HITL Review Workbench | Human review, comments, override, final decision | Phase 5 |
| Recommendation Packet | Explainable summary for decisioning | Phase 5 |
| Document Quality Analyzer | SnapText confidence and unreadable field flags | Phase 6 |
| Identity Consistency Check | Multi-patient and mismatch detection | Phase 6 |
| FWA Signal Engine | Duplicate, overuse, overprice, abnormal patterns | Phase 7 |
| Risk Triage Queue | Priority-based review routing | Phase 8 |
| Provider Analytics | Provider cost and utilization monitoring | Phase 9 |
| AI Governance Monitor | Accuracy, drift, override, model lifecycle | Phase 10 |
| Integration API | Claim, batch, result, callback, decision endpoints | Phase 11 |

## 20. Implementation Notes

- Keep SnapText as upstream extraction platform. CONSUL should integrate with SnapText outputs, not duplicate extraction.
- Master data import must support multiple source templates because hospital tariff books differ widely.
- Policy logic should be configurable per client and policy product, not hardcoded.
- AI review should be constrained by deterministic rule outputs and source evidence.
- HITL decision must be treated as the system of record for final decision.
- Every recommendation must be explainable and audit-ready.
- Provider analytics should be designed from day one by storing structured validation outcomes.

## 21. Open Questions

1. What SnapText metadata fields are guaranteed for each extracted row?
2. Does SnapText provide OCR/table confidence per cell or only per document/row?
3. Which policy products should be used for first POC rule templates?
4. Should excess calculation be based on policy benefit, room entitlement, deductible, or configurable formulas?
5. What final decision statuses are required by target payer/TPA systems?
6. Is callback delivery required in POC, or is result polling sufficient?
7. What is the target SLA for one claim and one batch?
8. What batch size should be demonstrated in POC?
9. What audit packet format is preferred: JSON, PDF, CSV, or all three?
10. Which provider analytics views are most important for the first client demo?
