import { Component } from '@angular/core';
import { GROUP_RULES } from './group-rules';

@Component({
  selector: 'app-group-rules',
  template: `<div class="page-heading"><div><div class="eyebrow">COMBINADO É COMBINADO</div><h1>Regras do grupo</h1><p>As regras da pelada CAPS FC para todo mundo jogar junto.</p></div></div>
    <div class="group-rules">@for(rule of rules; track rule.number) {<section class="card group-rule"><div class="rule-heading"><span class="rule-number">{{rule.number}}</span><h2>{{rule.title}}</h2></div><ul>@for(item of rule.items; track $index) {<li>@if(item.label) {<strong>{{item.label}}: </strong>}{{item.text}}</li>}</ul></section>}</div>`
})
export class GroupRulesComponent {readonly rules=GROUP_RULES;}
