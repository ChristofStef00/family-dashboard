export default function MessageOverlay({ messages = [] }) {
  if (!messages.length) return null;
  const latest = messages[0];
  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-40 card px-6 py-3 max-w-[80vw]">
      <div className="text-fg text-lg font-light tracking-wide">{latest.message}</div>
    </div>
  );
}
