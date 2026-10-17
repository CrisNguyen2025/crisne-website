"use strict";
/**
 * Roadmap Chat SDK — TypeScript client and Headless React SDK for the Roadmap RAG Assistant.
 *
 * @module roadmap-chat-sdk
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToolExecutionCard = exports.ThoughtProcess = exports.CalloutAlert = exports.MarkdownTable = exports.CodeBlock = exports.StreamingCaret = exports.renderInline = exports.parseBlocks = exports.ChatMarkdown = exports.useRoadmapAssistantChat = exports.RoadmapChatbotWidget = exports.RoadmapChatClient = void 0;
// Core HTTP & Streaming Client
var client_1 = require("./client");
Object.defineProperty(exports, "RoadmapChatClient", { enumerable: true, get: function () { return client_1.RoadmapChatClient; } });
// React Chatbot Widget & Headless Hooks
var RoadmapChatbotWidget_1 = require("./react/RoadmapChatbotWidget");
Object.defineProperty(exports, "RoadmapChatbotWidget", { enumerable: true, get: function () { return RoadmapChatbotWidget_1.RoadmapChatbotWidget; } });
var useRoadmapAssistantChat_1 = require("./react/useRoadmapAssistantChat");
Object.defineProperty(exports, "useRoadmapAssistantChat", { enumerable: true, get: function () { return useRoadmapAssistantChat_1.useRoadmapAssistantChat; } });
// Rich Markdown Engine & Components
var ChatMarkdown_1 = require("./react/ChatMarkdown");
Object.defineProperty(exports, "ChatMarkdown", { enumerable: true, get: function () { return ChatMarkdown_1.ChatMarkdown; } });
Object.defineProperty(exports, "parseBlocks", { enumerable: true, get: function () { return ChatMarkdown_1.parseBlocks; } });
Object.defineProperty(exports, "renderInline", { enumerable: true, get: function () { return ChatMarkdown_1.renderInline; } });
Object.defineProperty(exports, "StreamingCaret", { enumerable: true, get: function () { return ChatMarkdown_1.StreamingCaret; } });
var CodeBlock_1 = require("./react/components/CodeBlock");
Object.defineProperty(exports, "CodeBlock", { enumerable: true, get: function () { return CodeBlock_1.CodeBlock; } });
var MarkdownTable_1 = require("./react/components/MarkdownTable");
Object.defineProperty(exports, "MarkdownTable", { enumerable: true, get: function () { return MarkdownTable_1.MarkdownTable; } });
var CalloutAlert_1 = require("./react/components/CalloutAlert");
Object.defineProperty(exports, "CalloutAlert", { enumerable: true, get: function () { return CalloutAlert_1.CalloutAlert; } });
var ThoughtProcess_1 = require("./react/components/ThoughtProcess");
Object.defineProperty(exports, "ThoughtProcess", { enumerable: true, get: function () { return ThoughtProcess_1.ThoughtProcess; } });
var ToolExecutionCard_1 = require("./react/components/ToolExecutionCard");
Object.defineProperty(exports, "ToolExecutionCard", { enumerable: true, get: function () { return ToolExecutionCard_1.ToolExecutionCard; } });
// Icons & Formatters for UI customizers
__exportStar(require("./react/icons"), exports);
__exportStar(require("./react/utils/formatters"), exports);
