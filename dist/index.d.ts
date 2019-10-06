import { XYCoord, BackendFactory } from 'dnd-core';
export declare function eventShouldStartDrag(e: any): boolean;
export declare function eventShouldEndDrag(e: any): boolean;
export declare function getNodeClientOffset(node: any): XYCoord | undefined;
declare const createKeyboardBackendFactory: BackendFactory;
export default createKeyboardBackendFactory;
