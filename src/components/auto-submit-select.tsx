"use client";

export function AutoSubmitSelect({
  name,
  defaultValue,
  children,
}: {
  name: string;
  defaultValue: string;
  children: React.ReactNode;
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      onChange={(event) => event.currentTarget.form?.requestSubmit()}
      className="min-h-11 w-full rounded-lg border border-border bg-white px-2 text-sm"
    >
      {children}
    </select>
  );
}
