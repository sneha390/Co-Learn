import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * Defines the structure for the data sent to the AI service.
 * The extra optional fields are used to scope and constrain the AI
 * when we are inside a structured learning checkpoint.
 */
interface AiTutorData {
    userQuery: string;
    language: string;
    code: string;
    input: string;
    output: string;
    checkpointType?: string;
    checkpointTitle?: string;
    checkpointDescription?: string;
    aiMode?: "socratic" | "hint" | "review" | "summarizer";
}

// Base system prompt to guide the AI's behavior.
// NOTE: Additional, mode-specific instructions are injected per request.
const baseSystemPrompt = `You are an expert programming tutor working inside a collaborative learning room.
Your goal is to help learners understand concepts by guiding them, not by dumping full solutions.
Always stay within the scope of the current checkpoint description.
Keep your responses concise, encouraging, and focused on learning, not just answers.`;

function modeInstructions(mode?: AiTutorData["aiMode"]): string {
    switch (mode) {
        case "socratic":
            return `Mode: Socratic.
Ask short, leading questions that nudge the learners to think.
Do NOT write code for them. Do NOT reveal the final answer or full solution.
Prefer questions over explanations.`;
        case "hint":
            return `Mode: Hint.
Give partial guidance, patterns to look for, or small corrections.
You may show tiny code fragments if absolutely necessary, but avoid writing the full solution.
Do NOT paste complete working code.`;
        case "review":
            return `Mode: Review.
You are reviewing a plain-English explanation written by a learner.
Evaluate clarity and correctness. Point out gaps or misconceptions kindly.
Do NOT rewrite the entire explanation for them; instead, suggest specific improvements.
End with a brief verdict like "This is sufficient to move on." or "This needs a bit more detail about X."`;
        case "summarizer":
            return `Mode: Summarizer.
Summarize what the learners did and discussed in this checkpoint in simple language.
Highlight key takeaways and any remaining open questions.
Do NOT introduce brand new advanced topics.`;
        default:
            return `Mode: Default tutor.
Give hints and explanations, but avoid dumping full solutions unless the learner explicitly asks for them and seems very stuck.`;
    }
}

/**
 * Constructs the full prompt for the AI based on the user's code, question,
 * and (optionally) learning checkpoint context.
 * @param data The code, input, output, and user's specific query.
 * @returns The structured string query for the AI.
 */
function constructUserQuery(data: AiTutorData): string {
    const checkpointContext = data.checkpointTitle
        ? `Current checkpoint:
Title: ${data.checkpointTitle}
Type: ${data.checkpointType || "unknown"}
Description:
${data.checkpointDescription || "No detailed description provided."}
`
        : "";

    return `${baseSystemPrompt}

${modeInstructions(data.aiMode)}

Here is my current situation:
Language: ${data.language}
Code:
\`\`\`${data.language}
${data.code}
\`\`\`
Input given to the code:
\`\`\`
${data.input || "No input provided."}
\`\`\`
Output from the code:
\`\`\`
${data.output || "No output yet."}
\`\`\`
${checkpointContext}
My question is: ${data.userQuery}
    `;
}

/**
 * Calls the Gemini API to get an AI-generated tutor response.
 * @param data The necessary context for the AI.
 * @returns A promise that resolves to the AI's text response.
 */
export async function getAiTutorResponse(data: AiTutorData): Promise<string> {
    if (!process.env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY is not configured in environment variables.");
    }
    const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = ai.getGenerativeModel({ model: "gemini-2.5-flash" });
    const userQuery = constructUserQuery(data);

    try {
        const result = await model.generateContent(userQuery);
        const response = await result.response;
        const aiResponseText = response.text();
        
        if (!aiResponseText) {
            console.error("AI response was empty:", response);
            return "Sorry, I couldn't generate a helpful response right now. The AI might be having an issue.";
        }

        return aiResponseText;

    } catch (error) {
        console.error("Error in getAiTutorResponse:", error);
        return "Sorry, the AI tutor is temporarily unavailable. Please try again later.";
    }
}