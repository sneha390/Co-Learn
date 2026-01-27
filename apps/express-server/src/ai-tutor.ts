import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * Defines the structure for the data sent to the AI service.
 */
interface AiTutorData {
    userQuery: string;
    language: string;
    code: string;
    input: string;
    output: string;
}

// System prompt to guide the AI's behavior
const systemPrompt = `You are an expert programming tutor. Your goal is to help a student learn by guiding them to the solution, not giving it away.
Analyze the user's code, their provided input, and the resulting output.
Provide hints, ask leading questions, and explain concepts.
Do not write the correct code for them unless they are completely stuck and explicitly ask for the solution.
Keep your responses concise and encouraging.`;

/**
 * Constructs the full prompt for the AI based on the user's code and question.
 * @param data The code, input, output, and user's specific query.
 * @returns The structured string query for the AI.
 */
function constructUserQuery(data: AiTutorData): string {
    return `
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