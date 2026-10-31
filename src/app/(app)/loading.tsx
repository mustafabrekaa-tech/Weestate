// Shown at once while a page loads, so a click never looks ignored.
export default function Loading() {
  return (
    <div className="we-skel" aria-busy="true" aria-label="Loading">
      <div className="we-skel__line" style={{ width: 180 }} />
      <div className="we-skel__line we-skel__title" />
      <div className="we-skel__grid">{[0, 1, 2, 3].map((i) => <div key={i} className="we-skel__card" />)}</div>
      <div className="we-skel__block" />
    </div>
  );
}
