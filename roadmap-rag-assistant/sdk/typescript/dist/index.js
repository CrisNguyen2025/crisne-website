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
exports.useRoadmapAssistantChat = exports.RoadmapChatbotWidget = exports.RoadmapChatClient = void 0;
// Core HTTP & Streaming Client
var client_1 = require("./client");
Object.defineProperty(exports, "RoadmapChatClient", { enumerable: true, get: function () { return client_1.RoadmapChatClient; } });
// React Chatbot Widget & Headless Hooks
var RoadmapChatbotWidget_1 = require("./react/RoadmapChatbotWidget");
Object.defineProperty(exports, "RoadmapChatbotWidget", { enumerable: true, get: function () { return RoadmapChatbotWidget_1.RoadmapChatbotWidget; } });
var useRoadmapAssistantChat_1 = require("./react/useRoadmapAssistantChat");
Object.defineProperty(exports, "useRoadmapAssistantChat", { enumerable: true, get: function () { return useRoadmapAssistantChat_1.useRoadmapAssistantChat; } });
// Icons & Formatters for UI customizers
__exportStar(require("./react/icons"), exports);
__exportStar(require("./react/utils/formatters"), exports);
