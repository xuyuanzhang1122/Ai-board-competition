export function applyToolboxTitle(page: Pick<Document, 'title'>): () => void {
  const previous = page.title
  page.title = '创作工具箱 · 你的不对我的队'
  return () => {
    page.title = previous
  }
}
