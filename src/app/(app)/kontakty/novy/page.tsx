import { createContactAction } from "@/lib/actions";

export default function NewContactPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">Nový kontakt</h1>
      <p className="mt-1 text-sm text-slate-500">Telefónne číslo je povinné — z neho sa neskôr volá cez Twilio.</p>
      <form action={createContactAction} className="mt-6 grid gap-4 rounded-2xl border border-border bg-white p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="firstName" label="Meno" required />
          <Field name="lastName" label="Priezvisko" required />
        </div>
        <Field name="phone" label="Telefón" required placeholder="+4219..." />
        <Field name="email" label="E-mail" type="email" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="companyName" label="Firma" />
          <Field name="title" label="Pozícia" />
        </div>
        <Field name="city" label="Mesto" />
        <Field name="source" label="Zdroj" placeholder="web, zoznam, partner..." />
        <button className="min-h-11 rounded-lg bg-accent px-4 font-semibold text-white">Uložiť kontakt</button>
      </form>
    </div>
  );
}

function Field({
  name,
  label,
  required,
  type = "text",
  placeholder,
}: {
  name: string;
  label: string;
  required?: boolean;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        className="mt-1 min-h-11 w-full rounded-lg border border-border bg-muted px-3"
      />
    </label>
  );
}
