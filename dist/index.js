const ELEMENT_NODE = 1;
export function eventShouldStartDrag(e) {
    return e.key === 'Enter';
}
export function eventShouldEndDrag(e) {
    return e.key === 'Escape';
}
export function getNodeClientOffset(node) {
    const el = node.nodeType === ELEMENT_NODE ? node : node.parentElement;
    if (!el) {
        return undefined;
    }
    const { top, left } = el.getBoundingClientRect();
    return { x: left, y: top };
}
class KeyboardBackend {
    constructor(manager, options) {
        this._focusOffset = {};
        this.getSourceClientOffset = (sourceId) => {
            return getNodeClientOffset(this.sourceNodes[sourceId]);
        };
        this.handleMoveStart = (sourceId, e) => {
            if (!eventShouldStartDrag(e)) {
                return;
            }
            // Just because we received an event doesn't necessarily mean we need to collect drag sources.
            // We only collect start collecting drag sources on touch and left mouse events.
            this.moveStartSourceIds = [sourceId];
            this.dragOverTargetIds = [];
        };
        this.handleFocusStart = (e, targetId) => {
            if (this.dragOverTargetIds) {
                this.dragOverTargetIds = [targetId];
                this.handleDropAreaFocus(e, targetId);
            }
        };
        this.handleKeydown = (e) => {
            if (!this.document || !eventShouldStartDrag(e)) {
                return;
            }
            if (e.key === 'Enter') {
                const { moveStartSourceIds } = this;
                if (!this.monitor.isDragging() && moveStartSourceIds) {
                    this.actions.beginDrag(moveStartSourceIds, {
                        clientOffset: this._focusOffset,
                        getSourceClientOffset: this.getSourceClientOffset,
                        publishSource: false,
                    });
                    if (this.options && this.options.focusOnBeginDrag) {
                        const elm = this.document.querySelector(this.options.focusOnBeginDrag);
                        elm.focus();
                    }
                }
                else {
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
        this.handleDropAreaBlur = (e, targetId) => {
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
        };
        this.handleDropAreaFocus = (e, targetId) => {
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
        };
        this.handleEndCapture = (e) => {
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
            if (this.options && this.options.focusOnCancelDrag) {
                const elm = this.document && this.document.querySelector(this.options.focusOnCancelDrag);
                elm.focus();
            }
        };
        this.actions = manager.getActions();
        this.monitor = manager.getMonitor();
        this.sourceNodes = {};
        this.sourcePreviewNodes = {};
        this.sourcePreviewNodeOptions = {};
        this.targetNodes = {};
        this.options = options;
    }
    // public for test
    get window() {
        return window;
    }
    // public for test
    get document() {
        if (this.window) {
            return this.window.document;
        }
        return undefined;
    }
    setup() {
        if (!this.window) {
            return;
        }
        if (KeyboardBackend.isSetUp) {
            throw new Error('Cannot have two Keyboard backends at the same time.');
        }
        KeyboardBackend.isSetUp = true;
        this.addEventListener(this.window, 'keydown', this.handleEndCapture);
    }
    teardown() {
        if (!this.window) {
            return;
        }
        KeyboardBackend.isSetUp = false;
        this._focusOffset = {};
        this.removeEventListener(this.window, 'end', this.handleEndCapture, true);
    }
    addEventListener(subject, event, handler) {
        subject.addEventListener(event, handler);
    }
    removeEventListener(subject, event, handler, capture) {
        subject.removeEventListener(event, handler);
    }
    connectDragSource(sourceId, node) {
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
    connectDragPreview(sourceId, node, options) {
        this.sourcePreviewNodeOptions[sourceId] = options;
        this.sourcePreviewNodes[sourceId] = node;
        return () => {
            delete this.sourcePreviewNodes[sourceId];
            delete this.sourcePreviewNodeOptions[sourceId];
        };
    }
    connectDropTarget(targetId, node) {
        if (!this.document) {
            return () => null;
        }
        const handleDropFocus = (e) => {
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
            const droppedOn = coords != null ? this.document.elementFromPoint(coords.x, coords.y) : undefined;
            const childMatch = droppedOn && node.contains(droppedOn);
            if (droppedOn === node || childMatch) {
                return this.handleFocusStart(e, targetId);
            }
        };
        this.addEventListener(node, 'focus', handleDropFocus);
        this.addEventListener(node, 'blur', this.handleDropAreaBlur);
        this.addEventListener(node, 'keydown', this.handleKeydown);
        this.targetNodes[targetId] = node;
        return () => {
            if (this.document) {
                delete this.targetNodes[targetId];
                this.removeEventListener(node, 'focus', handleDropFocus);
                this.removeEventListener(node, 'blur', this.handleDropAreaBlur);
                this.removeEventListener(node, 'keydown', this.handleKeydown);
            }
        };
    }
}
const createKeyboardBackendFactory = (manager, context, options) => new KeyboardBackend(manager, options);
export default createKeyboardBackendFactory;
