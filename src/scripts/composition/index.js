'use strict';

// External
import * as $ from '$';
import * as d3 from 'd3';
import isObject from '../../../node_modules/lodash-es/lang/isObject';

// Internal
import {LayoutNotAvailable} from './errors';
import * as config from './config';
import Topbar from './topbar';
import Columns from './columns';
import Links from './links';
import Nodes from './nodes';
import Scrollbars from './scrollbars';

class ListGraph {
  constructor (baseEl, data, rootNodes, options) {
    if (!d3.layout.listGraph) {
      throw new LayoutNotAvailable(
        'D3 list graph layout (d3.layout.listGraph.js) needs to be loaded ' +
        'before creating the visualization.'
      );
    }

    if (!isObject(options)) {
      options = {};
    }

    let that = this;

    this.baseEl = baseEl;
    this.baseElD3 = d3.select(baseEl);
    this.baseElJq = $(baseEl);
    this.svgJq = this.baseElJq.find('svg');

    if (this.svgJq.length) {
      this.svgD3 = d3.select(this.svgJq[0]);
    } else {
      this.svgD3 = d3.select('.list-graph').append('svg');
      this.svgJq = $(this.svgD3[0]);
    }

    this.rootNodes = rootNodes;

    this.width = options.width || this.svgJq.width();
    this.height = options.height || this.svgJq.height();
    this.scrollbarWidth = options.scrollbarWidth || config.SCROLLBAR_WIDTH;
    this.columns = options.columns || config.COLUMNS;
    this.rows = options.rows || config.ROWS;
    this.iconPath = options.iconPath || config.ICON_PATH;

    this.baseElJq
      .width(this.width)
      .addClass(config.CLASSNAME);

    this.layout = new d3.layout.listGraph(
      [
        this.width,
        this.height
      ],
      [
        this.columns,
        this.rows
      ]
    );

    this.data = data;
    this.visData = this.layout.process(this.data, this.rootNodes);

    this.topbar = new Topbar(this, this.baseElD3, this.visData);

    this.svgD3.attr('viewBox', '0 0 ' + this.width + ' ' + this.height);

    this.container = this.svgD3.append('g');

    this.columns = new Columns(this.container, this.visData);

    this.links = new Links(this.columns.groups, this.visData, this.layout);
    this.nodes = new Nodes(this.columns.groups, this.visData);
    this.columns.scrollPreparation(this, this.scrollbarWidth);
    this.scrollbars = new Scrollbars(
      this.columns.groups,
      this.visData,
      this.scrollbarWidth
    );

    // jQuery's mousewheel plugin is much nicer than D3's half-baked zoom event.
    this.$levels = $(this.columns.groups[0]).on('mousewheel', function (event) {
      that.mousewheelColumn(this, event);
    });

    // Normally we would reference a named methods but since we need to aceess
    // the class' `this` property instead of the DOM element we need to use an
    // arrow function.
    this.scrollbars.selection.on('mousedown', function () {
      that.scrollbarMouseDown(this, d3.event);
    });

    // We need to listen to `mouseup` and `mousemove` globally otherwise scrolling
    // will only work as long as the cursor hovers the actual scrollbar, which is
    // super annoying.
    d3.select(document)
      .on('mouseup', () => { this.globalMouseUp(d3.event); })
      .on('mousemove', () => { this.globalMouseMove(d3.event); });
  }

  static scrollY (el, offset) {
    d3.select(el).attr(
      'transform',
      'translate(0, ' + offset + ')'
    );
  }

  globalMouseUp (event) {
    if (this.activeScrollbar) {
      let data = this.activeScrollbar.datum();
      let deltaY = data.scrollbar.clientY - event.clientY;

      // Save final vertical position
      // Scrollbar
      data.scrollbar.scrollTop = Math.min(
        Math.max(
          data.scrollbar.scrollTop - deltaY,
          0
        ),
        data.scrollbar.scrollHeight
      );

      // Content
      data.scrollTop = Math.max(
        Math.min(
          data.scrollTop +
          data.invertedHeightScale(deltaY),
          0
        ),
        -data.scrollHeight
      );

      this.activeScrollbar.classed('active', false);

      this.activeScrollbar = undefined;
    }
  }

  globalMouseMove (event) {
    if (this.activeScrollbar) {
      let data = this.activeScrollbar.datum();
      let deltaY = data.scrollbar.clientY - event.clientY;

      // Scroll scrollbar
      ListGraph.scrollY(
        this.activeScrollbar.node(),
        Math.min(
          Math.max(
            data.scrollbar.scrollTop - deltaY,
            0
          ),
          data.scrollbar.scrollHeight
        )
      );

      // Scroll content
      let contentScrollTop = Math.max(
        Math.min(
          data.scrollTop +
          data.invertedHeightScale(deltaY),
          0
        ),
        -data.scrollHeight
      );

      ListGraph.scrollY(
        data.nodes,
        contentScrollTop
      );

      // Scroll Links
      this.links.scroll(
        data.linkSelections.outgoing,
        this.layout.offsetLinks(
          data.level,
          contentScrollTop,
          'source'
        )
      );

      this.links.scroll(
        data.linkSelections.incoming,
        this.layout.offsetLinks(
          data.level - 1,
          contentScrollTop,
          'target'
        )
      );
    }
  }

  scrollbarMouseDown (el, event) {
    this.activeScrollbar = d3.select(el).classed('active', true);
    this.activeScrollbar.datum().scrollbar.clientY = event.clientY;
  }

  mousewheelColumn (el, event) {
    event.preventDefault();

    let data = d3.select(el).datum();

    if (data.scrollHeight > 0) {
      // Scroll nodes
      data.scrollTop = Math.max(
        Math.min(data.scrollTop + event.deltaY, 0),
        -data.scrollHeight
      );

      ListGraph.scrollY(data.nodes, data.scrollTop);

      // Scroll scrollbar
      data.scrollbar.scrollTop = data.scrollbar.heightScale(
        -data.scrollTop
      );

      ListGraph.scrollY(
        data.scrollbar.el,
        data.scrollbar.scrollTop
      );

      // Scroll Links
      this.links.scroll(
        data.linkSelections.outgoing,
        this.layout.offsetLinks(
          data.level,
          data.scrollTop,
          'source'
        )
      );

      this.links.scroll(
        data.linkSelections.incoming,
        this.layout.offsetLinks(
          data.level - 1,
          data.scrollTop,
          'target'
        )
      );
    }
  }

  selectByColumn (index, selector) {
    return d3.select(this.columns.groups[0][index]).selectAll(selector);
  }

  sortColumn (level, property, sortOrder) {
    this.nodes.sort(this.layout.sort(level, property, sortOrder).nodes(level));
    this.links.sort(this.layout.links(level - 1, level + 1));
  }
}

export default ListGraph;
