import React from 'react';
import View from 'laboratory/view';
import ElectronifyDoc from 'electronify/doc-electronify/widget';

class DocView extends View {
  render() {
    return <ElectronifyDoc />;
  }
}

export default DocView;
