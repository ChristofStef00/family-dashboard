// Full-bleed embed of a Home Assistant Lovelace dashboard. The dashboard
// itself is built in Home Assistant; we only point an iframe at it.
//
// Deliberately un-sandboxed: HA needs scripts, same-origin storage for its
// auth session, and websockets. This is the family's own HA on the LAN.
export default function HAFrame({ url }) {
  if (!url) {
    return (
      <div className="h-full w-full flex items-center justify-center p-6">
        <div className="card px-8 py-7 max-w-lg text-center">
          <div className="text-4xl mb-4">🏠</div>
          <h2 className="text-2xl font-light tracking-tight mb-2">
            No smart-home dashboard yet
          </h2>
          <p className="text-fg/55 text-sm leading-relaxed">
            Add your Home Assistant dashboard URL under{' '}
            <span className="text-fg/75">Setup → Home Assistant</span> in the
            admin UI, and it will show up here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <iframe
      src={url}
      title="Home Assistant"
      className="h-full w-full border-0 block"
      allow="fullscreen; camera; microphone; geolocation"
    />
  );
}
