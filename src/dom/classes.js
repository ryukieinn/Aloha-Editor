/**
 * dom/classes.js is part of Aloha Editor project http://aloha-editor.org
 *
 * Aloha Editor is a WYSIWYG HTML5 inline editing library and editor.
 * Copyright (c) 2010-2014 Gentics Software GmbH, Vienna, Austria.
 * Contributors http://aloha-editor.org/contribution.php
 */
define([
	'dom/nodes',
	'maps',
	'arrays',
	'strings',
	'browsers'
], function DomClasses(
	Nodes,
	Maps,
	Arrays,
	Strings,
	Browsers
) {
	'use strict';

	/**
	 * Uses a string modifier function such as Strings.addToList to
	 * modify the classList of an element
	 *
	 * @private
	 * @param {Element}        elem
	 * @param {Function}       func
	 * @param {Array.<string>} classes
	 */
	function modifyClassList(elem, func, classes) {
		elem.className = Strings.uniqueList(func.apply(
			null,
			[elem.className].concat(classes)
		));
	}

	/**
	 * Adds one or more classes to current classes of the given Element.
	 *
	 * @param {!Element}   elem
	 * @param {...!string} className
	 */
	function add(elem) {
		modifyClassList(elem, Strings.addToList, Arrays.coerce(arguments).slice(1));
	}

	/**
	 * Removes one or more class names from the given element's
	 * classList.
	 *
	 * @param  {!Element}   elem
	 * @param  {...!string} className
	 */
	function remove(elem) {
		modifyClassList(elem, Strings.removeFromList, Arrays.coerce(arguments).slice(1));
	}

	/**
	 * Checks whether the given node has the specified class.
	 *
	 * @param  {Node}    node
	 * @param  {string}  value
	 * @return {boolean}
	 */
	function has(node, value) {
		return Nodes.isElementNode(node)
		    && node.className.trim().split(Strings.WHITE_SPACES).indexOf(value) >= 0;
	}

	return {
		has    : has,
		add    : add,
		remove : remove
	};
});