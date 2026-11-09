import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { renderAntigravityMcp } from '../../../scripts/agent-adapter/adapters/antigravity';
import { renderClaudeMcp } from '../../../scripts/agent-adapter/adapters/claude';
import { loadMcpConfig } from '../../../scripts/agent-adapter/core/load';
import { McpServer } from '../../../scripts/agent-adapter/core/model';

describe('MCP Adapter & Loader', () => {
  describe('renderClaudeMcp', () => {
    it('renders stdio transport with type "stdio"', () => {
      const servers: McpServer[] = [
        {
          id: 'playwright',
          transport: 'stdio',
          command: 'npx',
          args: ['@playwright/mcp@latest'],
          env: { CI: 'true' },
        },
      ];

      const outputs = renderClaudeMcp(servers);
      expect(outputs).toHaveLength(1);
      const out = outputs[0];
      expect(out.kind).toBe('own');
      expect(out.path).toBe('.mcp.json');

      if (out.kind === 'own') {
        const parsed = JSON.parse(out.content);
        expect(parsed.mcpServers.playwright).toEqual({
          type: 'stdio',
          command: 'npx',
          args: ['@playwright/mcp@latest'],
          env: { CI: 'true' },
        });
      }
    });

    it('renders http transport with type "http"', () => {
      const servers: McpServer[] = [
        {
          id: 'remote-service',
          transport: 'http',
          url: 'https://example.com/mcp',
          headers: { Authorization: 'Bearer token' },
        },
      ];

      const outputs = renderClaudeMcp(servers);
      const out = outputs[0];
      expect(out.kind).toBe('own');
      if (out.kind === 'own') {
        const parsed = JSON.parse(out.content);
        expect(parsed.mcpServers['remote-service']).toEqual({
          type: 'http',
          url: 'https://example.com/mcp',
          headers: { Authorization: 'Bearer token' },
        });
      }
    });

    it('merges x-claude and ignores x-antigravity', () => {
      const servers: McpServer[] = [
        {
          id: 'custom',
          transport: 'stdio',
          command: 'node',
          args: ['server.js'],
          env: {},
          'x-claude': { maxTurns: 10 },
          'x-antigravity': { hidden: true },
        },
      ];

      const outputs = renderClaudeMcp(servers);
      const out = outputs[0];
      expect(out.kind).toBe('own');
      if (out.kind === 'own') {
        const parsed = JSON.parse(out.content);
        expect(parsed.mcpServers.custom.maxTurns).toBe(10);
        expect(parsed.mcpServers.custom.hidden).toBeUndefined();
      }
    });
  });

  describe('renderAntigravityMcp', () => {
    it('renders stdio transport without type', () => {
      const servers: McpServer[] = [
        {
          id: 'playwright',
          transport: 'stdio',
          command: 'npx',
          args: ['@playwright/mcp@latest'],
          env: { DEBUG: '1' },
        },
      ];

      const outputs = renderAntigravityMcp(servers);
      expect(outputs).toHaveLength(1);
      const out = outputs[0];
      expect(out.kind).toBe('own');
      expect(out.path).toBe('.agents/mcp_config.json');

      if (out.kind === 'own') {
        const parsed = JSON.parse(out.content);
        expect(parsed.mcpServers.playwright).toEqual({
          command: 'npx',
          args: ['@playwright/mcp@latest'],
          env: { DEBUG: '1' },
        });
        expect(parsed.mcpServers.playwright.type).toBeUndefined();
      }
    });

    it('renders http transport with url and headers, without type', () => {
      const servers: McpServer[] = [
        {
          id: 'remote-service',
          transport: 'http',
          url: 'https://example.com/mcp',
          headers: { 'X-Custom': 'val' },
        },
      ];

      const outputs = renderAntigravityMcp(servers);
      const out = outputs[0];
      expect(out.kind).toBe('own');
      if (out.kind === 'own') {
        const parsed = JSON.parse(out.content);
        expect(parsed.mcpServers['remote-service']).toEqual({
          url: 'https://example.com/mcp',
          headers: { 'X-Custom': 'val' },
        });
        expect(parsed.mcpServers['remote-service'].type).toBeUndefined();
      }
    });

    it('merges x-antigravity and ignores x-claude', () => {
      const servers: McpServer[] = [
        {
          id: 'custom',
          transport: 'stdio',
          command: 'node',
          args: ['server.js'],
          env: {},
          'x-claude': { maxTurns: 10 },
          'x-antigravity': { timeoutMs: 5000 },
        },
      ];

      const outputs = renderAntigravityMcp(servers);
      const out = outputs[0];
      expect(out.kind).toBe('own');
      if (out.kind === 'own') {
        const parsed = JSON.parse(out.content);
        expect(parsed.mcpServers.custom.timeoutMs).toBe(5000);
        expect(parsed.mcpServers.custom.maxTurns).toBeUndefined();
      }
    });
  });

  describe('loadMcpConfig validation', () => {
    let tmpDir: string;

    const setupMcp = (content: string) => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-adapter-mcp-test-'));
      const adapterDir = path.join(tmpDir, '.agents', 'adapter');
      fs.mkdirSync(adapterDir, { recursive: true });
      fs.writeFileSync(path.join(adapterDir, 'mcp.json'), content, 'utf-8');
      return tmpDir;
    };

    it('loads valid config', () => {
      const root = setupMcp(
        JSON.stringify({
          servers: [
            {
              id: 'server1',
              transport: 'stdio',
              command: 'test-cmd',
              args: ['arg1'],
              env: { FOO: 'BAR' },
            },
          ],
        }),
      );

      const servers = loadMcpConfig(root);
      expect(servers).toHaveLength(1);
      expect(servers[0].id).toBe('server1');
    });

    it('throws error when file does not exist', () => {
      const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-adapter-empty-'));
      expect(() => loadMcpConfig(emptyDir)).toThrow('File không tồn tại');
    });

    it('throws error on JSON syntax error with file path', () => {
      const root = setupMcp('{ invalid json }');
      expect(() => loadMcpConfig(root)).toThrow(/Lỗi cú pháp JSON tại .*mcp\.json/);
    });

    it('throws error when duplicate id exists', () => {
      const root = setupMcp(
        JSON.stringify({
          servers: [
            { id: 'dup', transport: 'stdio', command: 'cmd1' },
            { id: 'dup', transport: 'stdio', command: 'cmd2' },
          ],
        }),
      );
      expect(() => loadMcpConfig(root)).toThrow('Trùng lặp server id "dup"');
    });

    it('throws error on unknown transport', () => {
      const root = setupMcp(
        JSON.stringify({
          servers: [{ id: 's1', transport: 'websocket', command: 'cmd1' }],
        }),
      );
      expect(() => loadMcpConfig(root)).toThrow('Transport không hợp lệ');
    });

    it('throws error when stdio misses command', () => {
      const root = setupMcp(
        JSON.stringify({
          servers: [{ id: 's1', transport: 'stdio' }],
        }),
      );
      expect(() => loadMcpConfig(root)).toThrow('thiếu trường "command"');
    });

    it('throws error when http misses url', () => {
      const root = setupMcp(
        JSON.stringify({
          servers: [{ id: 's1', transport: 'http' }],
        }),
      );
      expect(() => loadMcpConfig(root)).toThrow('thiếu trường "url"');
    });
  });
});
