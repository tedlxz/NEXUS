/** Extract JSON from AI response that may contain markdown code blocks or extra text */
export function extractJson(text: string): string {
  // Strip <think>...</think> blocks that some models emit
  const stripped = text.replace(/<think>[\s\S]*?<\/think>\s*/g, '');

  // Try to find JSON in markdown code block
  const codeBlockMatch = stripped.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) return codeBlockMatch[1].trim();

  // Try to find raw JSON object
  const jsonMatch = stripped.match(/\{[\s\S]*\}/);
  if (jsonMatch) return jsonMatch[0];

  return stripped;
}
