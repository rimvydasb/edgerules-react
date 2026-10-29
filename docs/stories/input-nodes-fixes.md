# Input Node Fixes

- [x] Input nodes should be fixed respectively to be similar to the output nodes:
  - [x] If input node is an object, max 128 fields should be shown, with a "..." at the end if there are more fields.
  - [x] If input node data does not fit in input node, then clicking (on focus) it Boxed Editor should open on split
        screen (same behavior is for output nodes).
  - [x] If input node is an array, max 10 elements should be shown, with a "..." at the end if there are more elements.
- [x] As of now, array input node does not show data, but only structure - this is incorrect, it should show data as
      well, similar to output nodes. Max 10 elements should be shown, with a "..." at the end if there are more
      elements.
- [x] There must be a test and a storybook view where input node is just primitive elements array. It could be you will
      need to design such a node.
- [x] There must be a test and a storybook view where input node is just primitive single element. It could be you will
      need to design such a node.

# Available Nodes

- [x] There must be a possibility to select input as a list, object input, etc.
- [x] No need to display `Functions & rulesets` - add only one type `Invocation` - when user drags it, user will be able
      to select of what to invoke.
- [x] No need to display counts after category names, such as Charts 1 - it is obvious how many nodes are there by
      looking at list.
