import { AlertTriangle, Loader2, UserPlus, UserRound } from 'lucide-react';
import type { FormEvent } from 'react';
import { Alert, Button, Input, SegmentedControl } from '../freejoy';
import { AppLogo, MemoryMap } from '../components/primitives';
import type { AuthMode } from '../types';

const STEPS = ['会议纪要', '周报 Skill', '需求评审', '记忆沉淀'];

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
    <main className="auth-split">
      <section className="auth-hero">
        <div className="brand">
          <div className="brand-mark">
            <AppLogo size={22} strokeWidth={2.1} />
          </div>
          <div className="brand-copy">
            <strong>OFFICE AGENT</strong>
            <span>AI 办公智能体助手</span>
          </div>
        </div>
        <span className="auth-hero-pill">Free Joy</span>
        <h1>让每一次会议、周报与评审，都成为下一次工作的上下文。</h1>
        <p>登录后进入办公 Agent 工作台，AI 会引用你的会议记忆与资料库，帮你拆解并生成办公任务。</p>
        <div className="auth-steps">
          {STEPS.map((step, index) => (
            <div className="auth-step" key={step}>
              <span className="auth-step-num">{String(index + 1).padStart(2, '0')}</span>
              {step}
            </div>
          ))}
        </div>
        <MemoryMap />
      </section>

      <div className="auth-form-side">
        <form className="auth-card" onSubmit={onSubmit}>
          <div className="auth-card-heading">
            <h2>{mode === 'login' ? '欢迎回来' : '创建账号'}</h2>
            <p>{mode === 'login' ? '登录后进入你的办公工作区。' : '注册一个本地账号，密钥由你自己管理。'}</p>
          </div>

          <SegmentedControl
            full
            value={mode}
            onChange={(value) => onMode(value as AuthMode)}
            options={[
              { value: 'login', label: '登录' },
              { value: 'register', label: '注册' },
            ]}
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
            placeholder="name@company.com"
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
            {mode === 'login' ? '登录' : '注册'}
          </Button>

          <div className="note-panel mint">
            <span>全新用户可注册体验；AI 需要你在设置中填入自己的 Key，未配置时使用体验模式。</span>
          </div>

          <div className="auth-foot">
            <span>本地数据库账号 · 数据按账号隔离</span>
          </div>
        </form>
      </div>
    </main>
  );
}
