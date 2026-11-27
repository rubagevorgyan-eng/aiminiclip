import { lazy, Suspense } from 'react';
import { ToastProvider } from './components/Toasts.tsx';
import { useRoute } from './route.ts';
import { HomeScreen } from './screens/HomeScreen.tsx';
import { RoomScreen } from './screens/RoomScreen.tsx';
import { applySettings } from './storage.ts';
import { skipAll } from './fx/ticker.ts';

applySettings(); // device settings (reduced motion) onto <html>
// Escape skips any running cinematic decode (presentation only).
addEventListener('keydown', (e) => e.key === 'Escape' && skipAll());

// Dev-only design lab (fixtures). `import.meta.env.DEV` is false in production, so this import is removed from the build.
const DesignLab = import.meta.env.DEV ? lazy(() => import('./dev/DesignLab.tsx')) : null;
const showLab = DesignLab !== null && new URLSearchParams(location.search).has('lab');
// Dev-only engine harness (local, no network). Also removed from production builds.
const EngineHarness = import.meta.env.DEV ? lazy(() => import('./dev/EngineHarness.tsx')) : null;
const showHarness = EngineHarness !== null && new URLSearchParams(location.search).has('harness');

export function App() {
  const route = useRoute();
  return (
    <ToastProvider>
      <main className="stage">
        {showHarness && EngineHarness ? (
          <Suspense fallback={null}>
            <EngineHarness />
          </Suspense>
        ) : showLab && DesignLab ? (
          <Suspense fallback={null}>
            <DesignLab />
          </Suspense>
        ) : route.name === 'room' ? (
          <RoomScreen key={route.code} code={route.code} />
        ) : route.name === 'invalid-room' ? (
          <RoomScreen key={`bad:${route.raw}`} code={null} invalidRaw={route.raw} />
        ) : (
          <HomeScreen />
        )}
      </main>
    </ToastProvider>
  );
}
