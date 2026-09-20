export type AiScore = {
  politeness: number;
  comment: string;
  recommendations: string[];
  source: string;
};

export async function requestCallAiScore(input: {
  transcript: string;
  facts: string;
  card: string;
  rules: string;
}): Promise<AiScore | null> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch('/api/llm/score-call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: controller.signal,
    });
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as {
      politeness?: unknown;
      comment?: unknown;
      recommendations?: unknown;
      source?: unknown;
    };
    const politeness = Number(body.politeness);
    const comment = typeof body.comment === 'string' ? body.comment.trim() : '';
    const recommendations = Array.isArray(body.recommendations)
      ? body.recommendations.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [];
    const source = typeof body.source === 'string' ? body.source : '';
    if (!Number.isFinite(politeness) && !comment) {
      return null;
    }
    return {
      politeness: Number.isFinite(politeness) ? politeness : 12,
      comment,
      recommendations,
      source,
    };
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}
