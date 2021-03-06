/**
 * @license
 * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */

import * as estree from 'estree';
import {Document} from 'polymer-analyzer';

import {ConversionOutput, JsExport} from './js-module';
import {ConvertedDocumentUrl, OriginalDocumentUrl} from './url-converter';

export interface ConversionMetadata {
  readonly namespaces: ReadonlySet<string>;

  readonly excludes: ReadonlySet<string>;
  readonly includes: ReadonlySet<string>;
  readonly referenceExcludes: ReadonlySet<string>;

  readonly outputs: Map<ConvertedDocumentUrl, ConversionOutput>;
  readonly namespacedExports: Map<string, JsExport>;

  readonly referenceRewrites: ReadonlyMap<string, estree.Node>;

  readonly dangerousReferences: ReadonlyMap<string, string>;

  convertDocument(document: Document, visited: Set<OriginalDocumentUrl>): void;
}
