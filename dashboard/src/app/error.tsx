'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
      <div className="text-center space-y-4 max-w-md">
        <div className="text-4xl">&#x26A0;</div>
        <h2 className="text-xl font-semibold text-zinc-200">Something went wrong</h2>
        <p className="text-sm text-zinc-500">
          {error.message || 'An unexpected error occurred in the dashboard.'}
        </p>
        <button
          onClick={reset}
          className="px-4 py-2 text-sm font-medium text-zinc-200 bg-zinc-800 border border-zinc-700 rounded-lg hover:bg-zinc-700 transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
