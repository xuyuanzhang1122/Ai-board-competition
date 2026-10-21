import type { Run } from './types'

const statusNames: Record<string, string> = {
  PENDING: '排队中', RUNNING: '执行中', SUCCEEDED: '完成', FAILED: '失败', INVALID: '格式待修订',
  WAITING_USER: '待补充资料', NEEDS_REVIEW: '待人工核对', WAITING_INPUT: '待补充资料', NEEDS_INPUT: '待补充资料', MANUAL_REVIEW: '待人工核对', LIMIT_REACHED: '达到步骤上限',
}
export function RunEvidence({ run, canAdopt, adopt }: { run: Run; canAdopt: boolean; adopt: () => void }) {
  return (
    <article className="creation-run creation-stack">
      <h3>运行 #{run.id} · {statusNames[run.status] ?? run.status}</h3>
      <p className="creation-hint">输入版本 {run.inputRevision} · {run.model} · 提示词 v{run.promptVersion}</p>
      {run.error && <p className="creation-notice">{run.error}</p>}
      <ol className="brainstorm-steps">
        {run.steps.map((step) => (
          <li key={step.id}>
            <strong>{step.tool} · {step.status}</strong><span className="creation-hint"> {step.createdAt}</span>
            <details><summary>查看步骤输入与结果</summary><p>{step.inputSummary}</p><pre>{typeof step.result === 'string' ? step.result : JSON.stringify(step.result, null, 2)}</pre></details>
          </li>
        ))}
      </ol>
      {run.output && <details><summary>查看完整大纲候选</summary><pre>{JSON.stringify(run.output, null, 2)}</pre></details>}
      <button disabled={!canAdopt} type="button" onClick={adopt}>{run.applied ? '已采用' : '采用此大纲候选'}</button>
    </article>
  )
}
