import { Library, Wand2 } from 'lucide-react';
import { Button } from '../freejoy';
import { MemoryMap } from '../components/primitives';

export function HomeView({ onStart, onLibrary }: { onStart: () => void; onLibrary: () => void }) {
  return (
    <header className="workspace-hero home-hero">
      <div className="hero-copy">
        <h1>AI 办公智能体助手</h1>
        <div className="hero-actions">
          <Button size="lg" onClick={onStart} iconLeft={<Wand2 size={17} />}>
            进入会议纪要
          </Button>
          <Button size="lg" variant="secondary" onClick={onLibrary} iconLeft={<Library size={17} />}>
            打开会议记忆库
          </Button>
        </div>
      </div>
      <MemoryMap />
    </header>
  );
}
