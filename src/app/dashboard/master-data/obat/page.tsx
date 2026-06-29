import { Suspense } from "react";
import Link from "next/link";
import { getMedicalItemMasterEntries } from "./actions";
import MedicalItemMasterTable from "./components/MedicalItemMasterTable";
import DrugBulkImport from "./components/DrugBulkImport";

export default async function MasterObatPage() {
  const data = await getMedicalItemMasterEntries({ page: 1, limit: 10 });

  const cards = [
    { label: "Total referensi", value: data.total, tone: "text-foreground" },
    { label: "Referensi aktif", value: data.summary.active, tone: "text-foreground" },
    { label: "Kedaluwarsa", value: data.summary.expired, tone: "text-muted-foreground" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground">Master Data</p>
          <h1 className="mt-2 text-3xl font-light tracking-tight text-foreground">Master Farmalkes</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground font-light">
            Pantau referensi harga obat, vaksin, suplemen, dan alat kesehatan yang digunakan untuk validasi klaim. Anda dapat mengimpor data farmalkes dari file JSON atau menambahkan entri baru.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center mt-2">
          <DrugBulkImport />
          <Link
            href="/dashboard/master-data/obat/tambah"
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background shadow-sm transition-colors hover:bg-foreground/90 focus:outline-none"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            Tambah Entri
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">{card.label}</p>
            <p className={`mt-3 text-3xl font-light tabular-nums ${card.tone}`}>{new Intl.NumberFormat("id-ID").format(card.value)}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <Suspense fallback={<div className="p-10 text-center text-muted-foreground font-light text-sm">Memuat referensi harga farmalkes...</div>}>
          <MedicalItemMasterTable data={data.entries} total={data.total} totalPages={data.totalPages} />
        </Suspense>
      </div>
    </div>
  );
}
