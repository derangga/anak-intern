// unslop — OpenCode plugin.
//
// Appends the unslop ruleset to the system prompt every turn, and registers
// this repo's skills/ directory so bro, presenterm, design-thinking, and
// effect-best-practices are available in OpenCode too.
//
// Reads skills/unslop/SKILL.md, the same file the Claude Code hook cats, so the
// two runtimes cannot drift.
//
// Install by symlinking into the global plugin dir, which OpenCode loads at
// startup without any opencode.json entry:
//   ln -s "$PWD/.opencode/plugins/unslop.mjs" ~/.config/opencode/plugins/unslop.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Node resolves the symlink before setting import.meta.url, so this lands in
// the repo rather than ~/.config/opencode/plugins.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const skillsDir = path.join(root, 'skills');
const rulesPath = path.join(skillsDir, 'unslop', 'SKILL.md');

export default async ({ client } = {}) => {
  const log = (level, message) => {
    try {
      client?.app?.log({ body: { service: 'unslop', level, message } });
    } catch (e) {}
  };

  if (!fs.existsSync(rulesPath)) {
    log('error', 'ruleset not found at ' + rulesPath + ', unslop is inert');
  }

  return {
    // Register the skills dir. Guarded because `skills` is newer than the
    // pinned @opencode-ai/plugin types and may not exist on older runtimes.
    config: async (config) => {
      try {
        config.skills = config.skills || {};
        config.skills.paths = config.skills.paths || [];
        if (!config.skills.paths.includes(skillsDir)) {
          config.skills.paths.push(skillsDir);
        }
      } catch (e) {
        log('warn', 'could not register skills path: ' + e.message);
      }
    },

    // Append the ruleset to the system prompt every turn. Read fresh rather
    // than cached at import, so editing SKILL.md takes effect without a
    // restart. The file is a few KB, the read is not worth avoiding.
    'experimental.chat.system.transform': async (_input, output) => {
      let rules;
      try {
        rules = fs.readFileSync(rulesPath, 'utf8');
      } catch (e) {
        return;
      }
      if (output.system.length > 0) {
        output.system[output.system.length - 1] += '\n\n' + rules;
      } else {
        output.system.push(rules);
      }
    },
  };
};
