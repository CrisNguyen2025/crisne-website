function parse(rawText) {
  if (!rawText || !rawText.trim()) {
    return { event: 'PreToolUse', tool: { category: 'other', name: '' } };
  }
  const data = JSON.parse(rawText);
  const toolName = data.tool_name || '';
  let category = 'other';
  if (/^(Read|Grep|Glob)$/.test(toolName)) {
    category = 'read';
  } else if (toolName === 'Bash') {
    category = 'shell';
  } else if (/^(Edit|Write)$/.test(toolName)) {
    category = 'edit';
  }

  const toolInput = data.tool_input || {};
  const tool = {
    category,
    name: toolName,
  };
  if (toolInput.file_path !== undefined) {
    tool.path = String(toolInput.file_path);
  }
  if (toolInput.command !== undefined) {
    tool.command = String(toolInput.command);
  }

  const event = data.hook_event_name || 'PreToolUse';
  return { event, tool };
}

function format(result) {
  if (result && result.decision === 'deny') {
    return {
      stdout: JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: result.reason || 'Operation denied by hook',
        },
      }),
      exitCode: 0,
    };
  }
  return { stdout: '', exitCode: 0 };
}

module.exports = { parse, format };
