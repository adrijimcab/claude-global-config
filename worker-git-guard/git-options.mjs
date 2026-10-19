/**
 * How git reads the options of the subcommands worker-git-guard judges: which word is an option, which word is
 * that option's value, and which state each option is left in once the whole line is read.
 *
 * THE TABLES are git's own lists, measured from git 2.54.0 on 2026-10-19: the long options from
 * `git <subcommand> --git-completion-helper-all` (a trailing `=` marks a required value) and the short ones from
 * `git <subcommand> -h`. A long option `--no-x` whose positive `--x` is also listed is the negation of `x`;
 * that is how `--verify` undoes `--no-verify` and `--no-dry-run` undoes `--dry-run`.
 *
 * HOW A WORD IS READ, as git's parse-options reads it:
 *   - after a bare `--` every word is a path;
 *   - a long option is matched exactly, or by an abbreviation that is the prefix of exactly ONE listed option;
 *     a prefix of several is AMBIGUOUS (git refuses the command) and is kept with every candidate;
 *   - a required value is the text after `=` or the next word (`--message --no-verify`: the message is
 *     `--no-verify`);
 *   - a short cluster (`-anm`) is walked character by character and stops at the first option with a value:
 *     a required value is the rest of the cluster or the next word, an optional one (`-S`, `-u` of commit) is
 *     only the rest of the cluster and never the next word.
 *
 * THE STATE. Git applies options in order and the last one wins (`--dry-run --no-dry-run` commits).
 * `surely` answers "is it certainly in this state", for an option that ALLOWS a command; `mayBe` answers "can it
 * be in this state", for an option that REFUSES one, and an ambiguous abbreviation counts there.
 *
 * @es Cómo lee git las opciones de los subcomandos que juzga worker-git-guard: qué palabra es opción, cuál es su
 * valor y en qué estado queda cada opción al leer la línea entera. LAS TABLAS son las listas del propio git 2.54.0,
 * medidas el 2026-10-19 (`--git-completion-helper-all` para las largas, con `=` si el valor es obligatorio, y `-h`
 * para las cortas); `--no-x` es la negación de `x` cuando `--x` también figura. CÓMO SE LEE: tras un `--` suelto
 * todo son rutas; una opción larga coincide exacta o por una abreviatura que es prefijo de UNA sola opción (si lo
 * es de varias es AMBIGUA y se conservan todas las candidatas); un valor obligatorio es lo que sigue al `=` o la
 * palabra siguiente; un cúmulo corto se recorre carácter a carácter y se detiene en la primera opción con valor
 * (uno opcional, como `-S` o `-u` de commit, es solo el resto del cúmulo). EL ESTADO: gana la última; `surely`
 * responde «seguro que está así» (para lo que permite) y `mayBe` «puede estar así» (para lo que rechaza), donde
 * una abreviatura ambigua cuenta.
 */

/** Long options per subcommand, as git lists them. @es Opciones largas por subcomando, como las lista git. */
const LONG_OPTIONS = {
  commit: '--quiet --verbose --file= --author= --date= --message= --reedit-message= --reuse-message= --fixup= --squash= --reset-author --trailer= --signoff --template= --edit --cleanup= --status --gpg-sign --all --include --interactive --patch --unified= --inter-hunk-context= --only --no-verify --dry-run --short --branch --ahead-behind --porcelain --long --null --amend --no-post-rewrite --untracked-files --pathspec-from-file= --pathspec-file-nul --allow-empty --allow-empty-message --verify --post-rewrite --no-quiet --no-verbose --no-file --no-author --no-date --no-message --no-reedit-message --no-reuse-message --no-fixup --no-squash --no-reset-author --no-trailer --no-signoff --no-template --no-edit --no-cleanup --no-status --no-gpg-sign --no-all --no-include --no-interactive --no-patch --no-only --no-dry-run --no-short --no-branch --no-ahead-behind --no-porcelain --no-long --no-null --no-amend --no-untracked-files --no-pathspec-from-file --no-pathspec-file-nul --no-allow-empty --no-allow-empty-message',
  push: '--verbose --quiet --repo= --all --branches --mirror --delete --tags --dry-run --porcelain --force --force-with-lease --force-if-includes --recurse-submodules= --thin --receive-pack= --exec= --set-upstream --progress --prune --no-verify --follow-tags --signed --atomic --push-option= --ipv4 --ipv6 --verify --no-verbose --no-quiet --no-repo --no-all --no-branches --no-mirror --no-delete --no-tags --no-dry-run --no-porcelain --no-force --no-force-with-lease --no-force-if-includes --no-recurse-submodules --no-thin --no-receive-pack --no-exec --no-set-upstream --no-progress --no-prune --no-follow-tags --no-signed --no-atomic --no-push-option',
  clean: '--quiet --dry-run --force --interactive --exclude= --no-quiet --no-dry-run --no-force --no-interactive',
  restore: '--source= --staged --worktree --ignore-unmerged --overlay --quiet --recurse-submodules --progress --merge --conflict= --ours --theirs --patch --unified= --inter-hunk-context= --ignore-skip-worktree-bits --pathspec-from-file= --pathspec-file-nul --no-source --no-staged --no-worktree --no-ignore-unmerged --no-overlay --no-quiet --no-recurse-submodules --no-progress --no-merge --no-conflict --no-patch --no-ignore-skip-worktree-bits --no-pathspec-from-file --no-pathspec-file-nul',
  'read-tree': '--super-prefix= --index-output= --empty --verbose --trivial --aggressive --reset --prefix= --exclude-per-directory= --dry-run --no-sparse-checkout --debug-unpack --recurse-submodules --quiet --sparse-checkout --no-super-prefix --no-empty --no-verbose --no-trivial --no-aggressive --no-reset --no-dry-run --no-debug-unpack --no-recurse-submodules --no-quiet',
  'checkout-index': '--all --ignore-skip-worktree-bits --force --quiet --no-create --index --stdin --temp --prefix= --stage= --create --no-all --no-ignore-skip-worktree-bits --no-force --no-quiet --no-index --no-stdin --no-temp --no-prefix',
  'update-index': '--ignore-submodules --add --replace --remove --unmerged --refresh --really-refresh --cacheinfo --chmod= --assume-unchanged --no-assume-unchanged --skip-worktree --no-skip-worktree --ignore-skip-worktree-entries --info-only --force-remove --stdin --index-info --unresolve --again --ignore-missing --verbose --clear-resolve-undo --index-version= --show-index-version --split-index --untracked-cache --test-untracked-cache --force-untracked-cache --force-write-index --fsmonitor --fsmonitor-valid --no-fsmonitor-valid --no-ignore-submodules --no-add --no-replace --no-remove --no-unmerged --no-ignore-skip-worktree-entries --no-info-only --no-force-remove --no-ignore-missing --no-verbose --no-index-version --no-show-index-version --no-split-index --no-untracked-cache --no-test-untracked-cache --no-force-untracked-cache --no-force-write-index --no-fsmonitor',
  'update-ref': '--no-deref --stdin --create-reflog --batch-updates --deref --no-stdin --no-create-reflog --no-batch-updates',
  'symbolic-ref': '--quiet --delete --short --recurse --no-quiet --no-delete --no-short --no-recurse'
};

/**
 * Short options per subcommand: `<char>[=|?][:<long>]`, `=` a required value, `?` an optional attached one, and
 * `<long>` the long option it is (a short with none is its own key, `-<char>`).
 * @es Opciones cortas por subcomando: `<carácter>[=|?][:<larga>]`; `=` valor obligatorio, `?` opcional pegado.
 */
const SHORT_OPTIONS = {
  commit: 'q:quiet v:verbose F=:file m=:message c=:reedit-message C=:reuse-message s:signoff t=:template e:edit S?:gpg-sign a:all i:include p:patch U=:unified o:only n:no-verify z:null u?:untracked-files',
  push: 'v:verbose q:quiet d:delete n:dry-run f:force u:set-upstream o=:push-option 4:ipv4 6:ipv6',
  clean: 'q:quiet n:dry-run f:force i:interactive d e=:exclude x X',
  restore: 's=:source S:staged W:worktree q:quiet m:merge 2:ours 3:theirs p:patch U=:unified',
  'read-tree': 'v:verbose m u i n:dry-run q:quiet',
  'checkout-index': 'a:all f:force q:quiet n:no-create u:index z',
  'update-index': 'q z g:again',
  'update-ref': 'm= d z 0:batch-updates',
  'symbolic-ref': 'q:quiet d:delete m='
};

/**
 * One option as the guard tracks it: its `key`, the state `on` it sets, and whether it takes a value.
 * @es Una opción tal como la sigue el guard: su clave, el estado que fija y si lleva valor.
 */
function longTable(listing) {
  const names = listing.split(' ').map((word) => word.slice(2));
  const plain = new Set(names.map((name) => (name.endsWith('=') ? name.slice(0, -1) : name)));
  const table = new Map();

  for (const listed of names) {
    const required = listed.endsWith('=');
    const name = required ? listed.slice(0, -1) : listed;
    const negates = name.startsWith('no-') && plain.has(name.slice(3));

    table.set(name, { key: negates ? name.slice(3) : name, on: !negates, value: required ? 'required' : 'none' });
  }

  return table;
}

/** The short table of a subcommand, each resolved through its long option. @es La tabla corta, resuelta por su opción larga. */
function shortTable(listing, longs) {
  const table = new Map();

  for (const spec of listing.split(' ')) {
    const [head, long] = spec.split(':');
    const character = head.charAt(0);
    const marker = head.charAt(1);
    const value = marker === '=' ? 'required' : marker === '?' ? 'optional' : 'none';
    const resolved = long === undefined ? { key: `-${character}`, on: true } : longs.get(long);

    table.set(character, { key: resolved.key, on: resolved.on, value });
  }

  return table;
}

const TABLES = Object.fromEntries(
  Object.keys(LONG_OPTIONS).map((subcommand) => {
    const longs = longTable(LONG_OPTIONS[subcommand]);

    return [subcommand, { longs, shorts: shortTable(SHORT_OPTIONS[subcommand], longs) }];
  })
);

/** The subcommands whose options this module knows. @es Los subcomandos cuyas opciones conoce este módulo. */
export const KNOWN_SUBCOMMANDS = Object.freeze(Object.keys(TABLES));

/**
 * The listed options a long name means: itself when listed, otherwise every listed option it abbreviates.
 * @es Las opciones listadas que significa un nombre largo: él mismo, o todas las que abrevia.
 */
function candidatesOf(longs, name) {
  if (longs.has(name)) return [longs.get(name)];

  return [...longs.keys()].filter((listed) => listed.startsWith(name)).map((listed) => longs.get(listed));
}

/**
 * The options an invocation carries, in order, with option values and paths kept apart.
 * @param {string} subcommand One of `KNOWN_SUBCOMMANDS`.
 * @param {string[]} args The words after the subcommand.
 * @returns {{ events: Array<{ candidates: Array<{ key: string, on: boolean }>, value?: string }>, positionals: string[], afterDashes: string[] }}
 *   Each option occurrence with the options it can be (one, or several when ambiguous, none when unknown) and its
 *   value; the words that are neither options nor values, every word after `--` included; and those alone.
 * @es Las opciones de la invocación, en orden, con sus valores; las palabras que no son opción ni valor; y las que
 * siguen a `--`.
 */
export function optionsOf(subcommand, args) {
  const { longs, shorts } = TABLES[subcommand];
  const events = [];
  const positionals = [];
  let afterDashes = [];

  for (let index = 0; index < args.length; index += 1) {
    const word = args[index];

    if (word === '--') {
      afterDashes = args.slice(index + 1);
      positionals.push(...afterDashes);
      break;
    }

    if (word.startsWith('--')) {
      const equals = word.indexOf('=');
      const candidates = candidatesOf(longs, (equals === -1 ? word : word.slice(0, equals)).slice(2));
      const takesValue = candidates.length === 1 && candidates[0].value === 'required';
      let value = equals === -1 ? undefined : word.slice(equals + 1);

      if (value === undefined && takesValue && index + 1 < args.length) {
        index += 1;
        value = args[index];
      }

      events.push({ candidates, value });
    } else if (word.length > 1 && word.startsWith('-')) {
      for (let at = 1; at < word.length; at += 1) {
        const option = shorts.get(word[at]);

        if (option === undefined) {
          events.push({ candidates: [] });
          continue;
        }

        if (option.value === 'none') {
          events.push({ candidates: [option] });
          continue;
        }

        let value = word.slice(at + 1);

        if (value.length === 0 && option.value === 'required' && index + 1 < args.length) {
          index += 1;
          value = args[index]; // the value is the next word
        }

        events.push({ candidates: [option], value: value.length === 0 && option.value === 'optional' ? undefined : value });
        break; // the rest of the cluster is the value
      }
    } else {
      positionals.push(word);
    }
  }

  return { events, positionals, afterDashes };
}

/** The last occurrence that can set `key`, or `undefined`. @es La última aparición que puede fijar `key`. */
const lastTouching = (events, key) => events.findLast((event) => event.candidates.some((candidate) => candidate.key === key));

/**
 * Whether `key` is CERTAINLY left `on`: its last occurrence is unambiguous and sets that state.
 * @es Si `key` queda SEGURO en el estado `on`: su última aparición es inequívoca y lo fija.
 */
export function surely(events, key, on = true) {
  const last = lastTouching(events, key);

  return last !== undefined && last.candidates.length === 1 && last.candidates[0].on === on;
}

/**
 * Whether `key` CAN be left `on`: its last occurrence sets that state, or is an ambiguous abbreviation that could.
 * @es Si `key` PUEDE quedar en el estado `on`: su última aparición lo fija, o es una abreviatura ambigua que podría.
 */
export function mayBe(events, key, on = true) {
  const last = lastTouching(events, key);

  return last !== undefined && last.candidates.some((candidate) => candidate.key === key && candidate.on === on);
}

/**
 * Whether ANY occurrence can set `key` `on`, for an option git applies to the paths that follow it.
 * @es Si ALGUNA aparición puede fijar `key` en `on`, para una opción que git aplica a las rutas que le siguen.
 */
export const anyMayBe = (events, key, on = true) => events.some((event) => event.candidates.some((candidate) => candidate.key === key && candidate.on === on));

/**
 * The value `key` is left with: that of its last occurrence when it is unambiguous and `on`, else `undefined`.
 * @es El valor con el que queda `key`: el de su última aparición si es inequívoca y la activa; si no, `undefined`.
 */
export function finalValue(events, key) {
  const last = lastTouching(events, key);

  return last !== undefined && last.candidates.length === 1 && last.candidates[0].on ? last.value : undefined;
}
