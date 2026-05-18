export default function QuoteBar({ quote }) {
  if (!quote) return <div className="h-12" />;
  return (
    <div className="flex items-center justify-center px-6 py-4 text-fg/60 text-center">
      <span className="italic font-light text-sm md:text-base">
        “{quote.text}”
      </span>
      <span className="ml-3 text-fg/40 text-xs">— {quote.author}</span>
    </div>
  );
}
