import type { JobVO } from '@/shared/types/api'

export type GenerationHistoryFilter = 'all' | 'shot_image' | 'video'
export type GenerationHistorySort = 'date' | 'type'
export type GenerationHistoryType = Exclude<GenerationHistoryFilter, 'all'>

export function classifyGenerationJob(jobType: string): GenerationHistoryType | null {
  const normalized = jobType.toUpperCase()
  if (normalized.includes('VIDEO')) return 'video'
  if (normalized.includes('SHOT') && (normalized.includes('IMG') || normalized.includes('IMAGE'))) {
    return 'shot_image'
  }
  return null
}

export function getGenerationJobPreviewUrl(job: JobVO): string | null {
  return job.resultUrl || job.allImageUrls?.find(Boolean) || null
}

export function selectGenerationHistoryJobs(
  jobs: JobVO[],
  options: {
    filter: GenerationHistoryFilter
    projectId?: number | null
    sort: GenerationHistorySort
  },
): JobVO[] {
  return jobs
    .filter((job) => !options.projectId || job.projectId === options.projectId)
    .filter((job) => {
      const type = classifyGenerationJob(job.jobType)
      return type && (options.filter === 'all' || type === options.filter)
    })
    .toSorted((left, right) => {
      if (options.sort === 'type') {
        const typeOrder = (classifyGenerationJob(left.jobType) ?? '').localeCompare(
          classifyGenerationJob(right.jobType) ?? '',
        )
        if (typeOrder !== 0) return typeOrder
      }
      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
    })
}
