export function CountdownScreen({ secs }: { secs: number }) {
  return (
    <section className="screen countdown" aria-live="assertive">
      <p className="eyebrow">Lowering the cage</p>
      <p key={secs} className="countdown-num num">{secs}</p>
      <p className="dim">Get ready to dig</p>
    </section>
  );
}
