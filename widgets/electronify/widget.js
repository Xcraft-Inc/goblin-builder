import React from 'react';
import Form from 'laboratory/form';

import Container from 'goblin-gadgets/widgets/container/widget';
import Label from 'goblin-gadgets/widgets/label/widget';
import Button from 'goblin-gadgets/widgets/button/widget';
import Field from 'goblin-gadgets/widgets/field/widget';
import DirectoryInput from 'goblin-gadgets/widgets/directory-input-nc/widget';

const ElectronifyEnums = {
  app: ['polypheme', 'venture'],
};

class Electronify extends Form {
  constructor() {
    super(...arguments);
    this.runBuild = this.runBuild.bind(this);
  }

  static get wiring() {
    return {
      id: 'id',
    };
  }

  runBuild() {
    this.cmd('electronify.build', {
      app: this.getFormValue('.app'),
      output: this.getFormValue('.output'),
    });
  }

  render() {
    const Form = this.Form;

    return (
      <Container kind="view" grow="1" horizontalSpacing="large">
        <Container kind="pane-header">
          <Label text="Produire une release" kind="pane-header" />
        </Container>
        <Container kind="panes">
          <Form {...this.formConfig}>
            <Field
              kind="combo"
              labelText="application"
              list={ElectronifyEnums.app}
              model=".app"
            />
            <DirectoryInput model=".output" />
            <Button text="Build" onClick={this.runBuild} />
          </Form>
        </Container>
      </Container>
    );
  }
}

export default Electronify;
