export type ChatMessage = {
  id: string;
  from: "user" | "bot";
  text: string;
};