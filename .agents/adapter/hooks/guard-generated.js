// Dùng module.require thay cho require: file này nằm ngoài scripts/**, nơi ESLint của repo chưa cho phép require() kiểu CommonJS.
const path = module.require('path');
const { isGeneratedFile } = module.require('../../../scripts/agent-adapter/core/generated');

function sourceHint(relPath) {
  const lower = relPath.toLowerCase();
  if (lower === '.mcp.json' || lower === '.agents/mcp_config.json') {
    return '.agents/adapter/mcp.json';
  }
  if (lower === '.agents/hooks.json') {
    return '.agents/adapter/hooks.json';
  }
  const subagent = /^\.claude\/agents\/([^/]+)\.md$/i.exec(relPath);
  if (subagent) {
    return `.agents/adapter/subagents/${subagent[1]}/ (agent.json, prompt.md)`;
  }
  return '.agents/adapter/';
}

module.exports = async function guardGenerated(payload) {
  const { tool, repoRoot } = payload || {};
  if (!tool || tool.category !== 'edit' || !tool.path || !repoRoot) {
    return undefined;
  }

  // path.resolve xử lý cả đường dẫn tuyệt đối, tương đối, "./" và "..", nên không thể lách bằng cách viết đường dẫn khác đi.
  const relPath = path
    .relative(repoRoot, path.resolve(repoRoot, tool.path))
    .split(path.sep)
    .join('/');

  if (relPath === '' || relPath === '..' || relPath.startsWith('../')) {
    return undefined;
  }

  if (!isGeneratedFile(repoRoot, relPath)) {
    return undefined;
  }

  return {
    decision: 'deny',
    reason: `File "${relPath}" được sinh tự động bởi "yarn agents:sync". Không sửa trực tiếp file này; hãy sửa nguồn ở ${sourceHint(relPath)} rồi chạy "yarn agents:sync".`,
  };
};
