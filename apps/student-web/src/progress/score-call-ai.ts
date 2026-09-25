export type AiScore = {
  politeness: number;
  comment: string;
  recommendations: string[];
  source: string;
};

function unescapeJson(value: string): string {
  return value.replace(/\\n/g, ' ').replace(/\\"/g, '"').replace(/\\\\/g, '\\').trim();
}

export function readableScoreText(value: string): string {
  const text = value.trim();
  if (!text.startsWith('{') && !text.includes('"politeness"')) {
    return text;
  }
  return salvageScore(text).comment;
}

function salvageScore(text: string): { politeness?: number; comment: string; recommendations: string[] } {
  const start = text.indexOf('{');
  const slice = start >= 0 ? text.slice(start) : text;
  try {
    const data = JSON.parse(slice) as { politeness?: unknown; comment?: unknown; recommendations?: unknown };
    const nested = typeof data.comment === 'string' ? data.comment.trim() : '';
    if ((nested.startsWith('{') || nested.includes('"politeness"')) && nested !== text.trim()) {
      return salvageScore(nested);
    }
    const recommendations = Array.isArray(data.recommendations)
      ? data.recommendations.filter((item): item is string => typeof item === 'string' && item.trim().length > 0 && !item.trim().startsWith('{'))
      : [];
    return {
      politeness: Number(data.politeness),
      comment: nested,
      recommendations,
    };
  } catch {
    const politeness = /"politeness"\s*:\s*(\d+)/.exec(slice);
    const comment = /"comment"\s*:\s*"((?:\\.|[^"\\])*)/.exec(slice);
    const recommendations: string[] = [];
    const block = /"recommendations"\s*:\s*\[([\s\S]*)/.exec(slice);
    if (block) {
      for (const match of block[1].matchAll(/"((?:\\.|[^"\\])*)"/g)) {
        const item = unescapeJson(match[1] ?? '');
        if (item && !item.startsWith('{')) {
          recommendations.push(item);
        }
        if (recommendations.length >= 3) {
          break;
        }
      }
    }
    return {
      politeness: politeness ? Number(politeness[1]) : undefined,
      comment: comment ? unescapeJson(comment[1]) : '',
      recommendations,
    };
  }
}

export async function requestCallAiScore(input: {
  transcript: string;
  facts: string;
  card: string;
  rules: string;
}): Promise<AiScore | null> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 10000);
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
    const salvaged =
      typeof body.comment === 'string' && (body.comment.trim().startsWith('{') || body.comment.includes('"politeness"'))
        ? salvageScore(body.comment)
        : null;
    const politeness = Number(salvaged?.politeness ?? body.politeness);
    const comment = readableScoreText(typeof body.comment === 'string' ? body.comment : salvaged?.comment ?? '');
    const rawRecs = salvaged?.recommendations.length
      ? salvaged.recommendations
      : Array.isArray(body.recommendations)
        ? body.recommendations
        : [];
    const recommendations = rawRecs.filter((item): item is string => typeof item === 'string' && item.trim().length > 0 && !item.trim().startsWith('{'));
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
