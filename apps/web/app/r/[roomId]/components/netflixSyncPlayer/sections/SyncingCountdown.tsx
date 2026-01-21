export function SyncingCountdown(props: { countdown: number | null }) {
  const { countdown } = props;

  return (
    <div className="flex flex-col items-center gap-6 p-8">
      <div className="text-8xl font-bold text-white animate-pulse">
        {countdown}
      </div>
      <p className="text-zinc-400 text-lg">
        Press play in Netflix when countdown reaches 0
      </p>
    </div>
  );
}
