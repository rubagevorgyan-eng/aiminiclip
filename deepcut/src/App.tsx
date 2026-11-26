import Game from './components/Game.tsx';
import { Backdrop } from './components/ui/Backdrop.tsx';

export default function App() {
  return (
    <>
      <Backdrop />
      <main className="shell">
        <Game />
      </main>
    </>
  );
}
