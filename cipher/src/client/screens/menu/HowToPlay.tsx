import { Dossier } from '../../components/Dossier.tsx';

/** Rules briefing (original wording). */
export function HowToPlay() {
  return (
    <Dossier tab="BRIEFING" stamp="Eyes only" title="How to play" className="briefing">
      <ol className="briefing__list">
        <li><b>The board.</b> A grid of word cards. Behind each word hides an agent, a civilian or a mole. Only handlers hold the key.</li>
        <li><b>Handlers transmit.</b> On their turn a handler sends one word and a number: how many cards it points to. No other hints, gestures or board words.</li>
        <li><b>Operatives decode.</b> Teammates discuss, mark suggestions, and any operative on the team confirms a guess. Keep guessing while you find your own agents, up to the number plus one.</li>
        <li><b>Mistakes cost.</b> A civilian or a rival agent ends your turn. A mole ends the match at once.</li>
      </ol>
      <div className="briefing__modes">
        <p><b>Classic.</b> Crimson and Cobalt bureaus race on a 5×5 board. First to find all their agents wins.</p>
        <p><b>Duet.</b> Partner A and Partner B each see half of one shared key and work together against a limited number of turns. Run out and it is sudden death.</p>
        <p><b>Custom.</b> Classic rules with your choice of board (5×5 to 10×10), word packs, difficulty, moles and timers.</p>
      </div>
    </Dossier>
  );
}
