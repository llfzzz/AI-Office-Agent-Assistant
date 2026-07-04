import { AlertTriangle, Loader2, UserPlus, UserRound } from 'lucide-react';
import type { FormEvent } from 'react';
import { Alert, Button, Input, SegmentedControl } from '../freejoy';
import { AppLogo, MemoryMap } from '../components/primitives';
import type { AuthMode } from '../types';

export function AuthView({
  mode,
  form,
  error,
  isLoading,
  onMode,
  onForm,
  onSubmit,
}: {
  mode: AuthMode;
  form: { email: string; password: string; name: string };
  error: string;
  isLoading: boolean;
  onMode: (mode: AuthMode) => void;
  onForm: (form: { email: string; password: string; name: string }) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <main className="auth-screen">
      <section className="auth-hero">
        <div className="brand">
          <div className="brand-mark">
            <AppLogo size={22} strokeWidth={2.1} />
          </div>
          <div>
            <strong>Office Agent</strong>
            <span>AI 办公智能体助手</span>
          </div>
        </div>
        <h1>登录后进入办公 Agent 工作台，开始拆解和生成你的办公任务。</h1>
        <MemoryMap />
      </section>

      <form className="auth-card" onSubmit={onSubmit}>
        <div className="panel-heading compact">
          <div>
            <span className="eyebrow">{mode === 'login' ? '账号登录' : '创建账号'}</span>
            <h2>{mode === 'login' ? '继续使用' : '新建本地账号'}</h2>
          </div>
        </div>

        <SegmentedControl
          full
          value={mode}
          onChange={(value) => onMode(value as AuthMode)}
          options={[
            { value: 'login', label: '登录' },
            { value: 'register', label: '注册' },
          ]}
          style={{ marginBottom: 4 }}
        />

        {mode === 'register' && (
          <Input
            label="昵称"
            value={form.name}
            onChange={(event) => onForm({ ...form, name: event.target.value })}
            placeholder="用于侧边栏显示"
          />
        )}
        <Input
          label="邮箱"
          type="text"
          inputMode="email"
          value={form.email}
          onChange={(event) => onForm({ ...form, email: event.target.value })}
          placeholder="you@example.com"
          required
        />
        <Input
          label="密码"
          type="password"
          value={form.password}
          onChange={(event) => onForm({ ...form, password: event.target.value })}
          placeholder="至少 8 位"
          minLength={8}
          required
        />

        {error && (
          <Alert tone="danger" icon={<AlertTriangle size={18} />}>
            {error}
          </Alert>
        )}

        <Button
          type="submit"
          full
          size="lg"
          disabled={isLoading}
          iconLeft={isLoading ? <Loader2 className="spin" size={17} /> : mode === 'login' ? <UserRound size={17} /> : <UserPlus size={17} />}
        >
          {mode === 'login' ? '登录并连接' : '注册并进入'}
        </Button>
      </form>
    </main>
  );
}
