function parse(rawText) {
  if (!rawText || !rawText.trim()) {
    return { event: 'PreToolUse', tool: { category: 'other', name: '' } };
  }
  const data = JSON.parse(rawText);
  const toolCall = data.toolCall || data.tool_call || {};
  const toolName = toolCall.name || toolCall.tool_name || data.tool_name || data.name || '';

  let category = 'other';
  if (toolName === 'read_file') {
    category = 'read';
  } else if (toolName === 'run_command') {
    category = 'shell';
  } else if (/^(edit_file|write_file)$/.test(toolName)) {
    category = 'edit';
  }

  const args = toolCall.args || toolCall.arguments || data.args || data.arguments || {};
  const tool = {
    category,
    name: toolName,
  };

  const pathCandidates = ['Path', 'path', 'AbsolutePath', 'TargetFile', 'FilePath', 'file_path'];
  for (const key of pathCandidates) {
    if (typeof args[key] === 'string') {
      tool.path = args[key];
      break;
    }
  }

  if (typeof args.CommandLine === 'string') {
    tool.command = args.CommandLine;
  }

  const event = data.hookEvent || 'PreToolUse';
  return { event, tool };
}

function format(result) {
  if (result && result.decision === 'deny') {
    return {
      stdout: JSON.stringify({
        decision: 'deny',
        reason: result.reason || 'Operation denied by hook',
      }),
      exitCode: 0,
    };
  }
  return { stdout: '', exitCode: 0 };
}

module.exports = { parse, format };
