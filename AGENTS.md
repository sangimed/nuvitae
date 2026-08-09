## Destructive filesystem operations

Agents must not execute destructive filesystem commands in this repository.

Forbidden operations include, directly or indirectly:

- `rm`
- `rm -r`
- `rm -rf`
- `unlink`
- `rmdir`
- `find ... -delete`
- `git clean`
- `git reset --hard`
- `git checkout -- .`
- `git restore .`
- shell, Python, Node.js, Perl, Ruby, Docker  or other scripts whose purpose is to delete files or directories

These restrictions also apply when commands are wrapped through:

- `sh -c`
- `bash -c`
- `zsh -c`
- `xargs`
- `sudo`
- absolute executable paths such as `/bin/rm` or `/usr/bin/rm`

Agents must never:

- delete untracked files;
- drop, pop, clear, or delete Git stashes;
- remove files merely because they appear obsolete;
- clean the working tree automatically;
- resolve conflicts by discarding one side wholesale.

When a file appears obsolete or should be removed:

1. leave it unchanged;
2. report the exact path;
3. explain why deletion appears necessary;
4. wait for explicit human approval.

Before any autonomous coding session, create a recoverable snapshot that includes tracked, staged, unstaged, and untracked files.

Use the repository safety launcher when available:

`scripts/run-agent-safe.sh <agent command>`

Only the human operator may approve intentional deletion.
