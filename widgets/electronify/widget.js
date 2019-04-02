import React from 'react';
import Form from 'laboratory/form';

import Container from 'gadgets/container/widget';
import Label from 'gadgets/label/widget';
import Button from 'gadgets/button/widget';
import Field from 'gadgets/field/widget';

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
      <Container kind="view" grow="1" spacing="large">
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
            <Field kind="directory" model=".output" />
            <Button text="Build" onClick={this.runBuild} />
          </Form>
        </Container>
      </Container>
    );
  }
}

export default Electronify;
