'use strict';

// External
import * as d3 from 'd3';

// Internal
import * as traverse from './traversal';
import * as config from './config';
import Bars from './bars';
import Links from './links';
import {arrayToFakeObjs} from './utils';

const NODES_CLASS = 'nodes';
const NODE_CLASS = 'node';
const CLONE_CLASS = 'clone';

class Nodes {
  constructor (vis, baseSelection, visData, links, events) {
    let that = this;

    // Helper
    function drawFullSizeRect (selection, className, shrinking) {
      if (!shrinking) {
        shrinking = 0;
      }

      selection
        .attr('x', data => shrinking)
        .attr('y', data => that.visData.global.row.padding + shrinking)
        .attr('width', that.visData.global.column.contentWidth - 2 * shrinking)
        .attr('height', that.visData.global.row.contentHeight - 2 * shrinking)
        .attr('rx', 2 - shrinking)
        .attr('ry', 2 - shrinking)
        .classed(className, true);
    }

    this.vis = vis;
    this.visData = visData;
    this.links = links;
    this.events = events;
    this.currentLinks = {};

    this.groups = baseSelection.append('g')
      .attr('class', NODES_CLASS)
      .call(selection => {
        selection.each(function (data, index) {
          d3.select(this.parentNode).datum().nodes = this;
        });
      });

    this.nodes = this.groups
      .selectAll('.' + NODE_CLASS)
      .data(data => data.rows)
      .enter()
      .append('g')
        .classed(NODE_CLASS, true)
        .classed(CLONE_CLASS, data => data.clone)
        .attr('transform', data => 'translate(' +
          (data.x + this.visData.global.column.padding) + ', ' + data.y + ')');

    this.nodes
      .append('rect')
        .call(drawFullSizeRect, 'bg-border');

    this.nodes
      .append('rect')
        .call(drawFullSizeRect, 'bg', 1);

    let nodeLocks = this.nodes.append('g')
      .attr('class', 'lock inactive')
      .on('click', function () {
        that.toggleLock.call(that, this);
      });

    nodeLocks.append('circle')
      .call(this.setUpLock.bind(this), 'bg', 'bg');

    nodeLocks.append('svg')
      .call(
        this.setUpLock.bind(this),
        'icon',
        'icon-unlocked ease-all invisible-default'
      )
      .append('use')
        .attr('xlink:href', this.vis.iconPath + '#unlocked');

    nodeLocks.append('svg')
      .call(
        this.setUpLock.bind(this),
        'icon',
        'icon-locked ease-all invisible-default'
      )
      .append('use')
        .attr('xlink:href', this.vis.iconPath + '#locked');

    this.nodes.on('click', function (data) {
      that.mouseClick(this, data);
    });

    this.nodes.on('mouseenter', function (data) {
      that.highlightNodes(this, data);
    });

    this.nodes.on('mouseleave', function (data) {
      that.dehighlightNodes(this, data);
    });

    this.bars = new Bars(this.nodes, this.vis.barMode, this.visData);

    this.nodes
      .append('rect')
        .call(drawFullSizeRect, 'border');

    // Add node label
    this.nodes.call(selection => {
      selection.append('foreignObject')
        .attr('x', data => this.visData.global.cell.padding)
        .attr('y', data => this.visData.global.row.padding +
          this.visData.global.cell.padding)
        .attr('width', this.visData.global.column.contentWidth)
        .attr('height', this.visData.global.row.contentHeight -
          this.visData.global.cell.padding * 2)
        .attr('class', 'label-wrapper')
        .append('xhtml:div')
          .attr('class', 'label')
          .attr('title', data => data.data.name)
          .style('line-height', (this.visData.global.row.contentHeight -
            this.visData.global.cell.padding * 2) + 'px')
          .append('xhtml:span')
            .text(data => data.data.name);
    });

    // this.events.on('d3ListGraphNodeEnter', function (e, data) {
    //   console.log('d3ListGraphNodeEnter', e, data);
    // });

    // this.events.on('d3ListGraphNodeLeave', function (e, data) {
    //   console.log('d3ListGraphNodeLeave', e, data);
    // });

    // this.events.on('d3ListGraphNodeLock', function (e, data) {
    //   console.log('d3ListGraphNodeLock', e, data);
    // });

    // this.events.on('d3ListGraphNodeUnlock', function (e, data) {
    //   console.log('d3ListGraphNodeUnlock', e, data);
    // });
  }

  get barMode () {
    return this.bars.mode;
  }

  toggleLock (el) {
    let d3El = d3.select(el);
    let data = d3El.datum();

    if (this.lockedNode) {
      if (this.lockedNode.datum().id === data.id) {
        this.lockedNode.classed({
          'active': false,
          'inactive': true
        });
        this.unlockNode(this.lockedNode.datum().id);
        this.lockedNode = undefined;
      } else {
        // Reset previously locked node;
        this.lockedNode.classed({
          'active': false,
          'inactive': true
        });
        this.unlockNode(this.lockedNode.datum().id);

        d3El.classed({
          'active': true,
          'inactive': false
        });
        this.lockNode(data.id);
        this.lockedNode = d3El;
      }
    } else {
      d3El.classed({
        'active': true,
        'inactive': false
      });
      this.lockNode(data.id);
      this.lockedNode = d3El;
    }
  }

  lockNode (id) {
    let that = this;
    let els = this.nodes.filter(data => data.id === id);

    els.each(function (data) {
      let el = d3.select(this);

      that.highlightNodes(this, data, 'lock');
    });

    els.selectAll('.bg-border')
      .transition()
      .duration(config.TRANSITION_SEMI_FAST)
      .attr('width', function () {
        return parseInt(d3.select(this).attr('width')) + that.visData.global.row.height / 2;
      });
  }

  unlockNode (id) {
    let that = this;
    let els = this.nodes.filter(data => data.id === id);

    els.each(function (data) {
      that.dehighlightNodes(this, data, 'lock');
    });

    els.selectAll('.bg-border')
      .transition()
      .duration(config.TRANSITION_SEMI_FAST)
      .attr('width', this.visData.global.column.contentWidth);
  }

  setUpLock (selection, mode, className) {
    let height = (this.visData.global.row.contentHeight / 2 -
      this.visData.global.cell.padding * 2);
    let x = this.visData.global.column.contentWidth + 2;
    let y = this.visData.global.row.padding +
      (this.visData.global.row.contentHeight - 2 * this.visData.global.cell.padding) / 4;

    if (mode === 'bg') {
      selection
        .attr({
          class: className,
          cx: x + (height / 2),
          cy: y + (height / 2),
          r: height * 3 / 4,
        });
    } else {
      selection
        .attr({
          class: className,
          x: x,
          y: y,
          width: height,
          height: height
        });
    }
  }

  mouseClick (el, data) {
    this.events.broadcast('d3ListGraphNodeClick', { id: data.id });
  }

  highlightNodes (el, data, className) {
    let that = this;
    let currentNodeData = data;

    className = className ? className : 'hovering';

    // Store link IDs
    this.currentLinks[className] = [];

    let currentActiveProperty = d3.select(el)
      .selectAll('.bar.active .bar-magnitude').datum();

    let traverseCallbackUp = (data, childData) => {
      data.hovering = 2;
      for (let i = data.links.length; i--;) {
        // Only push direct parent child connections. E.g.
        // Store: (parent)->(child)
        // Ignore: (parent)->(siblings of child)
        if (data.links[i].target.node.id === childData.id) {
          this.currentLinks[className].push(data.links[i].id);
        }
      }
    };

    let traverseCallbackDown = data => {
      data.hovering = 2;
      for (let i = data.links.length; i--;) {
        this.currentLinks[className].push(data.links[i].id);
      }
    };
    traverse.upAndDown(data, traverseCallbackUp, traverseCallbackDown);

    if (data.clone) {
      data.originalNode.hovering = 1;
    }

    data.hovering = 1;

    this.nodes.each(function (data) {
      let node = d3.select(this);

      if (data.hovering === 1) {
        node.classed(className + '-directly', true);
      } else if (data.hovering === 2) {
        node.classed(className + '-indirectly', true);
        node.selectAll('.bar.' + currentActiveProperty.id)
          .classed('copy', data => {
            let id = data.id;

            if (data.clone) {
              id = data.originalNode.id;
            }

            if (id !== currentNodeData.id) {
              return true;
            }
          });

        let currentBar = d3.select(el).selectAll('.bar.' + currentActiveProperty.id)
          .classed('reference', true);

        that.bars.updateIndicator(
          node.selectAll('.bar.copy .bar-indicator'),
          currentBar.selectAll('.bar-indicator'),
          currentActiveProperty.value
        );
      }
    });

    this.links.highlight(
      arrayToFakeObjs(this.currentLinks[className]),
      true,
      className
    );

    this.events.broadcast('d3ListGraphNodeEnter', { id: data.id });
  }

  dehighlightNodes (el, data, className) {
    let traverseCallback = data => data.hovering = 0;

    className = className ? className : 'hovering';

    data.hovering = 0;
    traverse.upAndDown(data, traverseCallback);

    if (data.clone) {
      data.originalNode.hovering = 0;
    }

    this.nodes.classed(className + '-directly', false);
    this.nodes.classed(className + '-indirectly', false);

    this.links.highlight(
      arrayToFakeObjs(this.currentLinks[className]),
      false,
      className
    );

    this.events.broadcast('d3ListGraphNodeLeave', { id: data.id });
  }

  sort (update, newSortType) {
    for (let i = update.length; i--;) {
      let start = function () { d3.select(this).classed('sorting', true); };
      let end = function () { d3.select(this).classed('sorting', false); };

      let selection = this.nodes.data(update[i].rows, data => data.id);

      selection
        .transition()
        .duration(config.TRANSITION_SEMI_FAST)
        .attr('transform', data => 'translate(' +
          (data.x + this.visData.global.column.padding) + ', ' + data.y + ')')
        .each('start', start)
        .each('end', end);

      if (newSortType) {
        this.bars.update(selection.selectAll('.bar'), update[i].sortBy);
      }
    }
  }
}

export default Nodes;
