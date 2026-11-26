import { GAME, RARITY, ZONES } from '../../config/game.ts';
import { Modal } from '../ui/Modal.tsx';
import { RarityTag } from '../ui/RarityTag.tsx';

export function HowToPlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="How to play">
      <ol className="howto">
        <li><b>Answer the question.</b> Every question has many right answers. Type any one and press Enter. Wrong guesses can be retried until the {GAME.secondsPerQuestion}-second timer runs out.</li>
        <li><b>Rarer answers dig deeper.</b> The answer most people would give is coal. The one almost nobody thinks of is a diamond. Points are meters: 1 point = 1 meter.</li>
        <li><b>Seven questions per dig.</b> Skip if you're stuck. A skip or timeout is worth 0m. The deepest possible dig is {GAME.maxScore}m.</li>
      </ol>
      <div className="howto-tiers">
        {RARITY.map((t) => (
          <RarityTag key={t.id} rarity={t.id} points />
        ))}
      </div>
      <p className="dim howto-zones">Zones: {ZONES.map((z) => z.name).join(' · ')}</p>
      <p className="howto-modes"><b>Daily Dig</b> is the same seven questions for everyone, once per day (resets at 00:00 UTC). <b>Unlimited Dig</b> is random questions, as often as you like.</p>
    </Modal>
  );
}
