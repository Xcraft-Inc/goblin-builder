import React from 'react';
import View from 'laboratory/view';
import ElectronifyDoc from 'builder/doc-electronify/widget';

class DocView extends View {
  render() {
    return <ElectronifyDoc />;
  }
}

export default DocView;
