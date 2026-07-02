import { InternshipRoastForm } from "@/components/InternshipRoastForm";

export const metadata = {
  title: "Internship Roast by Internship Hunter"
};

export default function RoastPage() {
  return (
    <section className="section">
      <div className="max-w-3xl">
        <p className="text-sm font-semibold uppercase text-signal">Internship Roast by Internship Hunter</p>
        <h1 className="mt-3 text-4xl font-black tracking-tight text-ink sm:text-5xl">Finding an internship should be fun.</h1>
        <p className="mt-5 text-lg leading-8 text-ink/70">
          Paste any internship offer. We&apos;ll tell you if it&apos;s worth applying — or if it&apos;s just unpaid character development.
        </p>
      </div>

      <div className="mt-8">
        <InternshipRoastForm />
      </div>
    </section>
  );
}
