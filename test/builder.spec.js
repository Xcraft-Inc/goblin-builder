'use strict';

const {expect} = require('chai');

describe('goblin.builder', function () {
  const {yearWeekToBuildNumber} = require('../lib/get-year-week-number.js');

  it('getYearWeekNumber', function () {
    const buildNumber = yearWeekToBuildNumber(2025, 8);
    expect(buildNumber).to.be.eq(`2508`);
  });
});
