import { Component, input, output } from '@angular/core';

let nextRatingId = 0;

@Component({
  selector: 'app-star-rating',
  template: `
    <div class="rating" [class.rating-readonly]="readonly()">
      <div class="rating-stars" [attr.role]="readonly() ? 'img' : 'radiogroup'" [attr.aria-label]="label() + ': ' + formatted() + ' de 5 estrelas'">
        @for(star of stars; track star) {
          <span class="rating-star">
            <span class="star-outline" aria-hidden="true">☆</span>
            <span class="star-fill" aria-hidden="true" [class.star-full]="value() >= star" [class.star-half]="value() === star - 0.5">★</span>
            @if(!readonly()) {
              @for(half of [0.5, 0]; track half) {
                <label class="rating-choice" [class.rating-right]="half === 0">
                  <input type="radio" [name]="groupName" [value]="star - half" [checked]="value() === star - half" [disabled]="disabled()"
                    [attr.aria-label]="(star - half).toLocaleString('pt-BR') + ' estrelas'" (change)="valueChange.emit(star - half)">
                </label>
              }
            }
          </span>
        }
      </div>
      <span class="rating-number" aria-hidden="true">{{formatted()}} / 5</span>
    </div>`
})
export class StarRatingComponent {
  readonly value = input.required<number>();
  readonly valueChange = output<number>();
  readonly readonly = input(false);
  readonly disabled = input(false);
  readonly label = input('Avaliação');
  readonly stars = [1,2,3,4,5];
  readonly groupName = `rating-${nextRatingId++}`;
  formatted(): string { return this.value().toLocaleString('pt-BR', {minimumFractionDigits:1, maximumFractionDigits:1}); }
}
