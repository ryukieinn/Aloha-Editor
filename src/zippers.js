/**
 * zippers.js is part of Aloha Editor project http://aloha-editor.org
 *
 * Aloha Editor is a WYSIWYG HTML5 inline editing library and editor.
 * Copyright (c) 2010-2014 Gentics Software GmbH, Vienna, Austria.
 * Contributors http://aloha-editor.org/contribution.php
 *
 * @reference:
 * http://hackage.haskell.org/package/rosezipper-0.2/docs/src/Data-Tree-Zipper.html
 *
 * @usage:
 *	var boundaries = Boundaries.get(document);
 *	var zip = zipper(Dom.editingHost(Boundaries.container(boundaries[0])), {
 *		start : boundaries[0],
 *		end   : boundaries[1]
 *	});
 *	var loc = zip.tree;
 *	var markers = zip.markers;
 *	loc = split(gotoMarker(loc, markers.start));
 *	loc = insert(loc, contents(createRecord('#text'), ['↵']));
 *	loc = split(gotoMarker(loc, markers.end));
 *	var preserved = update(root(loc));
 *	console.log(aloha.markers.hint([preserved.start, preserved.end]));
 */
define([
	'dom',
	'maps',
	'html',
	'paths',
	'arrays',
	'Boromir',
	'boundaries',
	'functions'
], function (
	Dom,
	Maps,
	Html,
	Paths,
	Arrays,
	Boromir,
	Boundaries,
	Fn
) {
	'use strict';

	function isTextRecord(record) {
		return '#text' === record.name();
	}

	function contents(record, content) {
		record = arguments[0];
		if (1 === arguments.length) {
			return isTextRecord(record) ? record.text() : record.children();
		}
		if (isTextRecord(record)) {
			return record.text(content.join(''));
		}
		return record.children(content.map(function (item) {
			return item instanceof Boromir ? item : Boromir(item);
		}));
	}

	/**
	 * Represents a position between nodes inside a tree.
	 */
	function Location(lefts, rights, frames) {
		return {
			lefts  : lefts,
			rights : rights,
			frames : frames
		};
	}

	function peek(loc) {
		return Arrays.last(loc.frames);
	}

	/**
	 * The node before the given tree position.
	 *
	 * @param  {!Location} loc
	 * @return {Record}
	 */
	function before(loc) {
		return Arrays.last(loc.lefts);
	}

	/**
	 * The node after the given tree position.
	 *
	 * @param  {!Location} loc
	 * @return {Record}
	 */
	function after(loc) {
		return loc.rights[0];
	}

	function prev(loc, stride) {
		stride = 'number' === typeof stride ? stride : 1;
		return Location(
			loc.lefts.slice(0, -stride),
			loc.lefts.slice(-stride).concat(loc.rights),
			loc.frames.concat()
		);
	}

	function next(loc, stride) {
		stride = 'number' === typeof stride ? stride : 1;
		return Location(
			loc.lefts.concat(loc.rights.slice(0, stride)),
			loc.rights.slice(stride),
			loc.frames.concat()
		);
	}

	function down(loc) {
		return Location([], contents(after(loc)), loc.frames.concat(loc));
	}

	function up(loc) {
		var content = loc.lefts.concat(loc.rights);
		var frame = Arrays.last(loc.frames);
		var first = contents(after(frame), content);
		return Location(
			frame.lefts.concat(),
			[first].concat(frame.rights.slice(1)),
			loc.frames.slice(0, -1)
		);
	}

	function root(loc) {
		return loc.frames.reduce(up, loc);
	}

	function create(root) {
		return Location([], [Boromir(root)], []);
	}

	function isTextLocation(loc) {
		return 'string' === typeof after(loc);
	}

	function jump(loc, steps) {
		return 0 === steps ? loc : next(loc, steps);
	}

	function fragmentsLength(fragments) {
		return fragments.reduce(function (sum, record) {
			return sum + record.text().length;
		}, 0);
	}

	function walkPostOrder(loc, mutate) {
		loc = root(loc);
		var replacements;
		var trail = [];
		var offset;
		while (true) {
			if (isAtEnd(loc)) {
				loc = up(loc);
				if (isRoot(loc)) {
					break;
				}
				trail = trail.slice(0, -1);
				replacements = mutate(after(loc), trail);
				loc = jump(replace(loc, replacements), replacements.length);
			} else if (isVoid(loc)) {
				offset = isFragmentedText(after(up(loc)))
				       ? fragmentsLength(loc.lefts.filter(isTextRecord))
				       : loc.lefts.length;
				replacements = mutate(after(loc), trail.concat(offset));
				loc = jump(replace(loc, replacements), replacements.length);
			} else {
				if (!isRoot(loc)) {
					trail.push(loc.lefts.length);
				}
				loc = down(loc);
			}
		}
		return loc;
	}

	function walkPreOrderWhile(loc, pred) {
		pred = pred || Fn.returnTrue;
		loc = root(loc);
		while (pred(loc)) {
			if (isAtEnd(loc)) {
				do {
					if (isRoot(loc)) {
						return loc;
					}
					loc = up(loc);
				} while (isAtEnd(loc));
				loc = next(loc);
			} else if (isVoid(loc)) {
				loc = next(loc);
			} else {
				loc = down(loc);
			}
		}
		return loc;
	}

	function defragmentText(record) {
		var text = record.children().filter(isTextRecord).reduce(function (strings, string) {
			return strings.concat(string.text());
		}, []).join('');
		return (record.original && record.original.text() === text)
		     ? record.original
		     : createRecord('#text', [text]);
	}

	function update(loc) {
		var paths = [];
		loc = walkPostOrder(loc, function (record, trail) {
			if (isMarker(record)) {
				paths.push({
					name : record.marker,
					path : trail
				});
				return [];
			}
			if (isFragmentedText(record)) {
				return [defragmentText(record)];
			}
			if (!isTextRecord(record)) {
				if (record.children().length === 0) {
					return [record.style('outline', '3px solid rgba(150, 50, 50, 0.3)')];
				}
				return [record.style('outline', '3px solid rgba(50, 150, 50, 0.3)')];
			}
			return [record];
		});
		var editable = after(loc).updateDom().domNode();
		return paths.reduce(function (markers, mark) {
			markers[mark.name] = Paths.toBoundary(editable, mark.path);
			return markers;
		}, {});
	}

	function hint(loc) {
		var print = function (content) {
			return 'string' === typeof content
			     ? '“' + content + '”'
			     : isTextRecord(content)
			     ? content.text()
			     : content.domNode().outerHTML;
		};
		return loc.lefts.map(print).concat('▓', loc.rights.map(print)).join('');
	}

	function normalizeOffset(record, offset) {
		return offset + record.children().slice(0, offset).filter(isMarker).length;
	}

	function fragmentedOffset(record, offset) {
		if (0 === offset) {
			return [0];
		}
		var fragments = record.children();
		var len = fragments.length;
		var remainder = offset;
		var index = 0;
		var overflow;
		var fragment;
		while (index < len) {
			fragment = fragments[index];
			if (isMarker(fragment)) {
				index++;
				continue;
			}
			overflow = remainder - fragment.text().length;
			if (0 === overflow) {
				return [index + 1];
			}
			if (overflow < 0) {
				return [index, remainder];
			}
			index++;
			remainder = overflow;
		}
		throw 'Text offset out of bounds';
	}

	function splitText(text, offset) {
		return [text.substr(0, offset), text.substr(offset)];
	}

	function locationInText(loc, offset) {
		var text = splitText(contents(after(loc)), offset);
		return Location([text[0]], [text[1]], loc.frames.concat(loc));
	}

	function locationInElement(loc, offset) {
		return next(down(loc), normalizeOffset(after(loc), offset));
	}

	function locationInFragment(loc, offset) {
		var record = after(loc);
		var offsets = fragmentedOffset(record, offset);
		var atText = next(down(loc), offsets[0]);
		if (1 === offsets.length) {
			return atText;
		}
		var text = splitText(contents(after(atText)), offsets[1]);
		return next(splice(atText, 1, [
			contents(createRecord('#text'), [text[0]]),
			contents(createRecord('#text'), [text[1]])
		]));
	}

	function traverse(loc, path) {
		var offset;
		var trail = path.concat().reverse();
		while (trail.length) {
			while (isMarker(after(loc))) {
				loc = next(loc);
			}
			offset = trail.pop();
			if (isTextRecord(after(loc))) {
				return locationInText(loc, offset);
			}
			loc = isFragmentedText(after(loc))
			    ? locationInFragment(loc, offset)
			    : locationInElement(loc, offset);
		}
		return loc;
	}

	function clipCommonRoot(root, path) {
		for (var i = 0; i < root.length; i++) {
			if (path[i] !== root[i]) {
				return [];
			}
		}
		return path.slice(i);
	}

	function splice(loc, num, replacement) {
		var replacements = replacement instanceof Boromir
		                 ? [replacement]
		                 : replacement || [];
		return Location(
			loc.lefts.concat(),
			replacements.concat(loc.rights.slice(num)),
			loc.frames.concat()
		);
	}

	function insert(loc, items) {
		return splice(loc, 0, items);
	}

	function replace(loc, item) {
		return splice(loc, 1, item);
	}

	function remove(loc) {
		return splice(loc, 1);
	}

	/**
	 * FragmentedText implementation is backed by a 'Q' element in order to be
	 * able to visualize it in the document for debugging.
	 *
	 * FIXME: isFragmentedText and original won't be preserved on cloning.
	 */
	function FragmentedText(loc) {
		var atText = up(loc);
		var wrapper = Boromir(document.createElement('q'));
		wrapper.isFragmentedText = true;
		wrapper.original = after(atText);
		return Location(
			[contents(createRecord('#text'), loc.lefts)],
			[contents(createRecord('#text'), loc.rights)],
			down(replace(atText, wrapper)).frames.concat()
		);
	}

	function isFragmentedText(record) {
		return 'Q' === record.name();
	}

	var markerCount = 0;

	/**
	 * FIXME: isFragmentedText and original and isMarker won't be preserved on cloning.
	 */
	function Marker(boundary, name) {
		var node = document.createElement('code');
		node.innerHTML = ++markerCount;
		var record = Boromir(node);
		record.isMarker = true;
		record.boundary = boundary;
		record.marker = name;
		return record;
	}

	function isMarker(record) {
		return true === record.isMarker;
	}

	function mark(loc, marker) {
		return insert(isTextLocation(loc) ? FragmentedText(loc) : loc, marker);
	}

	function insertMarker(marker, loc, path) {
		return root(mark(traverse(loc, path), marker));
	}

	function zipper(element, boundaries) {
		return markup(create(element), boundaries);
	}

	function markTree(tree, boundary, markerName) {
		var element = after(tree).domNode();
		var body = element.ownerDocument.body;
		var root = Paths.fromBoundary(body, Boundaries.fromFrontOfNode(element));
		var path  = Paths.fromBoundary(body, boundary);
		var clipped = clipCommonRoot(root, path);
		if (0 === clipped.length) {
			return {
				tree   : tree,
				marker : null
			};
		}
		var marker = Marker(boundary, markerName);
		return {
			tree   : insertMarker(marker, tree, clipped),
			marker : marker
		};
	}

	function markup(tree, marked) {
		var markers = {};
		Maps.forEach(marked, function (value, key) {
			var result = markTree(tree, value, key);
			markers[key] = result.marker;
			tree = result.tree;
		});
		return {
			tree    : tree,
			markers : markers
		};
	}

	function createRecord(type, content) {
		var node = '#text' === type
		         ? document.createTextNode('')
		         : document.createElement(type);
		return 'undefined' === typeof content
		     ? Boromir(node)
		     : contents(Boromir(node), content);
	}

	function clone(record) {
		return Boromir(Dom.cloneShallow(record.domNode()));
	}

	function isRoot(loc) {
		return 0 === loc.frames.length;
	}

	function isVoid(loc) {
		var record = after(loc);
		return '#text' === record.name()
		    || isMarker(record)
		    || Html.isVoidNode(record.domNode());
	}

	function isAtStart(loc) {
		return 0 === loc.lefts.length;
	}

	function isAtEnd(loc) {
		return 0 === loc.rights.length;
	}

	function split(loc, until) {
		until = until || Fn.returnFalse;
		if (isRoot(peek(loc)) || until(loc)) {
			return loc;
		}
		var left, right;
		var upper = up(loc);
		if (isTextLocation(loc)) {
			left = createRecord('#text');
			right = createRecord('#text');
		} else {
			left = clone(after(upper));
			right = clone(after(upper));
		}
		left = contents(left, loc.lefts);
		right = contents(right, loc.rights);
		loc = Location(
			upper.lefts.concat(left),
			[right].concat(upper.rights.slice(1)),
			upper.frames.concat()
		);
		return split(loc, until);
	}

	function gotoMarker(tree, marker) {
		var loc = walkPreOrderWhile(root(tree), function (loc) {
			var record = after(loc);
			return !(record && isMarker(record) && record === marker);
		});
		return isRoot(loc) ? null : loc;
	}

	return {
		hint      : hint,
		update    : update,
		create    : create,
		before    : before,
		after     : after,
		prev      : prev,
		next      : next,
		up        : up,
		down      : down,
		root      : root,
		peek      : peek,
		split     : split,
		splice    : splice,
		insert    : insert,
		replace   : replace,
		remove    : remove,
		zipper    : zipper,
		isAtStart : isAtStart,
	};
});