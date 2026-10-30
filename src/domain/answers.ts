/** The request with each answer added after its question, e.g. "Be at work for 7. What time? 7pm". */
export function withAnswers(originalText: string, questions: string[], answers: string[]): string {
  const added = questions.map((q, i) => `${q} ${answers[i].trim()}`).join('. ');
  return `${originalText.trim()}. ${added}`;
}
