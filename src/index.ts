import {
  DragDropActions,
  DragDropMonitor,
  Backend,
  Identifier,
  XYCoord,
  DragDropManager,
  Unsubscribe,
  BackendFactory,
} from 'dnd-core';

const ELEMENT_NODE = 1;

export function eventShouldStartDrag(e: any) {
  return e.key === 'Enter';
}

export function eventShouldEndDrag(e: any) {
  return e.key === 'Escape';
}

export function getNodeClientOffset(node: any): XYCoord | undefined {
  const el = node.nodeType === ELEMENT_NODE ? node : node.parentElement;
  if (!el) {
    return undefined;
  }
  const { top, left } = el.getBoundingClientRect();
  return { x: left, y: top };
}

interface KeyboardOptions {
  focusOnBeginDrag: string;
  focusOnCancelDrag: string;
}
class KeyboardBackend implements Backend {
  // React-DnD Dependencies
  private actions: DragDropActions;
  private monitor: DragDropMonitor;
  private options: KeyboardOptions;
  // Internal State
  private static isSetUp: boolean;
  private sourceNodes: Record<Identifier, HTMLElement>;
  private sourcePreviewNodes: Record<string, HTMLElement>;
  private sourcePreviewNodeOptions: Record<string, {}>;
  private targetNodes: Record<string, HTMLElement>;
  private _focusOffset: Partial<XYCoord>;
  private moveStartSourceIds: string[] | undefined;
  private dragOverTargetIds: string[] | undefined;

  public constructor(manager: DragDropManager, options: any) {
    this.actions = manager.getActions();
    this.monitor = manager.getMonitor();

    this.sourceNodes = {};
    this.sourcePreviewNodes = {};
    this.sourcePreviewNodeOptions = {};
    this.targetNodes = {};
    this.options = options;
  }

  // public for test
  public get window() {
    return window;
  }

  // public for test
  public get document() {
    if (this.window) {
      return this.window.document;
    }
    return undefined;
  }

  public setup() {
    if (!this.window) {
      return;
    }

    if (KeyboardBackend.isSetUp) {
      throw new Error('Cannot have two Keyboard backends at the same time.');
    }
    KeyboardBackend.isSetUp = true;

    this.addEventListener(this.window, 'keydown', this.handleEndCapture as any);
  }

  public teardown() {
    if (!this.window) {
      return;
    }

    KeyboardBackend.isSetUp = false;
    this._focusOffset = {};

    this.removeEventListener(this.window, 'end', this.handleEndCapture as any, true);
  }



  private addEventListener(
    subject: HTMLElement | Window,
    event: string,
    handler: (e: any) => void
  ) {
    subject.addEventListener(event, handler as any);
  }

  private removeEventListener(
    subject: HTMLElement | Window,
    event: string,
    handler: (e: any) => void,
    capture?: boolean
  ) {
    subject.removeEventListener(event, handler as any);
  }

  public connectDragSource(sourceId: string, node: HTMLElement) {
    const handleMoveStart = this.handleMoveStart.bind(this, sourceId);
    this.sourceNodes[sourceId] = node;

    this.addEventListener(node, 'keydown', handleMoveStart);
    this.addEventListener(node, 'keyup', this.handleKeydown);

    return () => {
      delete this.sourceNodes[sourceId];
      this.removeEventListener(node, 'keydown', handleMoveStart);
      this.removeEventListener(node, 'keyup', this.handleKeydown);
    };  
  }

  public connectDragPreview(sourceId: string, node: HTMLElement, options: any) {
    this.sourcePreviewNodeOptions[sourceId] = options;
    this.sourcePreviewNodes[sourceId] = node;

    return () => {
      delete this.sourcePreviewNodes[sourceId];
      delete this.sourcePreviewNodeOptions[sourceId];
    };
  }

  public connectDropTarget(targetId: string, node: HTMLElement): Unsubscribe {
    if (!this.document) {
      return () => null as any;
    }

    const handleDropFocus = (e: KeyboardEvent) => {
      if (!this.document || !this.monitor.isDragging()) {
        return;
      }
      /**
       * Grab the coordinates for the current focus position
       */
      let coords = getNodeClientOffset(e.target);
      /**
       * Use the coordinates to grab the element the drag ended on.
       * If the element is the same as the target node (or any of it's children) then we have hit a drop target and can handle the move.
       */
      const droppedOn =
        coords != null ? this.document.elementFromPoint(coords.x, coords.y) : undefined;
      const childMatch = droppedOn && node.contains(droppedOn);

      if (droppedOn === node || childMatch) {
        return this.handleFocusStart(e, targetId);
      }
    };
    this.addEventListener(node, 'focus', handleDropFocus as any);
    this.addEventListener(node, 'blur', this.handleDropAreaBlur as any);
    this.addEventListener(node, 'keydown', this.handleKeydown as any);
    this.targetNodes[targetId] = node;

    return () => {
      if (this.document) {
        delete this.targetNodes[targetId];
        this.removeEventListener(node, 'focus', handleDropFocus as any);
        this.removeEventListener(node, 'blur', this.handleDropAreaBlur as any);
        this.removeEventListener(node, 'keydown', this.handleKeydown as any);
      }
    };
  }

  private getSourceClientOffset = (sourceId: string) => {
    return getNodeClientOffset(this.sourceNodes[sourceId]);
  };


  private handleMoveStart = (sourceId: string, e: Event) => {
    if (!eventShouldStartDrag(e)) {
      return;
    }
    // Just because we received an event doesn't necessarily mean we need to collect drag sources.
    // We only collect start collecting drag sources on touch and left mouse events.
    this.moveStartSourceIds = [sourceId];
    this.dragOverTargetIds = [];
  };

  private handleFocusStart = (e: any, targetId: string) => {
    if (this.dragOverTargetIds) {
      this.dragOverTargetIds = [targetId];
      this.handleDropAreaFocus(e, targetId);
    }
  };

  private handleKeydown = (e: KeyboardEvent) => {
    if (!this.document || !eventShouldStartDrag(e)) {
      return;
    }
    if(e.key === 'Enter'){
      const { moveStartSourceIds } = this;
      if (!this.monitor.isDragging()) {
        this.actions.beginDrag(moveStartSourceIds, {
          clientOffset: this._focusOffset,
          getSourceClientOffset: this.getSourceClientOffset,
          publishSource: false,
        });
        if(this.options && this.options.focusOnBeginDrag){
          const elm = this.document.querySelector(this.options.focusOnBeginDrag);
          (elm as any).focus();
        }
      } else {
        this._focusOffset = {};
        this.actions.drop();
        this.actions.endDrag();
        this.moveStartSourceIds = undefined;
        this.dragOverTargetIds = undefined;
      }
      if (this.monitor.isDragging()) {
        this.actions.publishDragSource();
      }

    }
  };

  private handleDropAreaBlur = (e: Event, targetId: string) => {
    if (!this.monitor.isDragging()) {
      return;
    }
    const clientOffset = getNodeClientOffset(e.target);
    if (clientOffset) {
      this._focusOffset = clientOffset;
    }

    e.preventDefault();
    this.actions.hover([], {
      clientOffset: this._focusOffset,
    });
  }

  private handleDropAreaFocus = (e: Event, targetId: string) => {
    if (!this.monitor.isDragging()) {
      return;
    }
    const clientOffset = getNodeClientOffset(e.target);
    if (clientOffset) {
      this._focusOffset = clientOffset;
    }

    e.preventDefault();
    this.actions.hover([targetId], {
      clientOffset: this._focusOffset,
    });
  }
  private handleEndCapture = (e: Event) => {
    if (!eventShouldEndDrag(e)) {
      return;
    }

    if (!this.monitor.isDragging() || this.monitor.didDrop()) {
      this.moveStartSourceIds = undefined;
      return;
    }
    e.preventDefault();
    this._focusOffset = {};
    this.actions.endDrag();
    if(this.options && this.options.focusOnCancelDrag){
      const elm = this.document.querySelector(this.options.focusOnCancelDrag);
      (elm as any).focus();
    }
  };
}

const createKeyboardBackendFactory: BackendFactory = (
  manager: DragDropManager,
  context: any,
  options?: KeyboardOptions
) => new KeyboardBackend(manager, options);

export default createKeyboardBackendFactory;