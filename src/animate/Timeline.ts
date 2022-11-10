import { Tween, TweenProps, EaseMethod } from './Tween';
import { AnimateDisplayObject } from './DisplayObject';

/**
 * The Timeline class represents a series of tweens, tied to keyframes.
 */
export class Timeline extends Array<Tween>
{
    /**
     * The target DisplayObject.
     */
    public target: AnimateDisplayObject;
    /**
     * Current properties in the tween, to make building the timeline more
     * efficient.
     */
    private _currentProps: TweenProps;

    /**
     * Creates a new Timeline. Must be used instead of a constructor because extending the Array
     * class is a pain: https://blog.simontest.net/extend-array-with-typescript-965cc1134b3
     * @param target The target for this string of tweens.
     * @returns A new Timeline instance.
     */
    public static create(target: AnimateDisplayObject): Timeline
    {
        const out = Object.create(Timeline.prototype) as Timeline;

        out.target = target;
        out._currentProps = {};

        return out;
    }

    // exists to be private to prevent usage
    private constructor()
    {
        super();
    }

    /**
     * Adds one or more tweens (or timelines) to this timeline. The tweens will be paused (to
     * remove them from the normal ticking system and managed by this timeline. Adding a tween to
     * multiple timelines will result in unexpected behaviour.
     * @method PIXI.animate.Timeline#addTween
     * @param tween The tween(s) to add. Accepts multiple arguments.
     * @return Tween The first tween that was passed in.
     */
    public addTween(properties: TweenProps, startFrame: number, duration: number, ease?: EaseMethod): void
    {
        this.extendLastFrame(startFrame - 1);
        // figure out what the starting values for this tween should be
        // ownership of startProps is passed to the new Tween - this object should not be reused
        const startProps: TweenProps = Object.assign({}, this._currentProps);

        for (const prop in properties)
        {
            const p = prop as keyof TweenProps;

            // if we have not already set that property in an earlier tween, handle that property
            if (!Object.hasOwnProperty.call(this._currentProps, prop))
            {
                const startValue = (startProps[p] as any) = this.getPropFromShorthand(p);

                // go through previous tweens to set the value so that when the timeline loops
                // around, the values are set properly - having each tween know what came before
                // allows us to set to a specific frame without running through the entire timeline
                for (let i = this.length - 1; i >= 0; --i)
                {
                    (this[i].startProps[p] as any) = startValue;
                    (this[i].endProps[p] as any) = startValue;
                }
            }
        }
        // create the new Tween and add it to the list
        const tween = new Tween(this.target, startProps, properties, startFrame, duration, ease);

        // if we have this frame already, replace it
        if (startFrame === this[this.length - 1].startFrame)
        {
            this[this.length - 1] = tween;
        }
        // otherwise add it to the list
        else
        {
            this.push(tween);
        }
        // update starting values for the next tween - if tweened values included 'p', then Tween
        // parsed that to add additional data that is required
        Object.assign(this._currentProps, tween.endProps);
    }

    /**
     * Add a single keyframe that doesn't tween.
     * Note that this has some capability to insert keyframes into the middle of a timeline, in order to
     * handle how masks are published, it should only be relied upon to add keyframes to the end of a timeline.
     * @method PIXI.animate.Timeline#addKeyframe
     * @param {Object} properties The properties to set.
     * @param {int} startFrame The starting frame index.
     * @param {int} [duration = 0] The number of frames to hold beyond startFrame (0 is single frame)
     */
    public addKeyframe(properties: TweenProps, startFrame: number, duration = 0): void
    {
        // see if we need to go back in and insert properties
        if (this.length && this[this.length - 1].startFrame >= startFrame)
        {
            for (let i = this.length - 1; i >= 0; --i)
            {
                const prev = this[i];

                // insert into an existing frame that shares the same keyframe
                if (prev.startFrame === startFrame)
                {
                    // update the start props
                    Object.assign(prev.startProps, properties);
                    // carry the new props over unless they're already overridden by end props
                    prev.endProps = Object.assign({}, prev.startProps, prev.endProps);
                    // go through any later keyframes to update them the same way
                    for (let k = i + 1; k < this.length; ++k)
                    {
                        const next = this[k];

                        next.startProps = Object.assign({}, properties, next.startProps);
                        next.endProps = Object.assign({}, next.startProps, next.endProps);
                    }
                    break;
                }
                // insert into the middle of an extended keyframe (but *not* one that tweens)
                else if (prev.startFrame < startFrame && prev.endFrame > startFrame && prev.isTweenlessFrame)
                {
                    prev.endFrame = startFrame - 1;
                    const startProps = Object.assign({}, prev.endProps, properties);
                    // create the new Tween and add it to the list
                    const tween = new Tween(this.target, startProps, null, startFrame, duration);

                    this.splice(i, 0, tween);
                    // go through any later keyframes to update them with our inserted props
                    for (let k = i + 1; k < this.length; ++k)
                    {
                        const next = this[k];

                        next.startProps = Object.assign({}, properties, next.startProps);
                        next.endProps = Object.assign({}, next.startProps, next.endProps);
                    }
                    break;
                }
                // insert in a gap between frames (which shouldn't really happen, but just in case)
                else if (prev.endFrame < startFrame)
                {
                    const startProps = Object.assign({}, prev.endProps, properties);
                    // create the new Tween and add it to the list
                    const tween = new Tween(this.target, startProps, null, startFrame, duration);

                    this.splice(i, 0, tween);

                    // go through any later keyframes to update them with our inserted props
                    for (let k = i + 1; k < this.length; ++k)
                    {
                        const next = this[k];

                        next.startProps = Object.assign({}, properties, next.startProps);
                        next.endProps = Object.assign({}, next.startProps, next.endProps);
                    }
                    break;
                }
            }
            // save in current props, but don't take priority over existing values since we went back in time
            Object.assign(this._currentProps, properties, this._currentProps);
        }
        else
        {
            this.extendLastFrame(startFrame - 1);
            const startProps = Object.assign({}, this._currentProps, properties);
            // create the new Tween and add it to the list
            const tween = new Tween(this.target, startProps, null, startFrame, duration);

            this.push(tween);
            Object.assign(this._currentProps, tween.endProps);
        }
    }

    /**
     * Extend the last frame of the tween.
     * @method PIXI.animate.Timeline#extendLastFrame
     * @param {int} endFrame The ending frame index.
     */
    public extendLastFrame(endFrame: number): void
    {
        if (this.length)
        {
            const prevTween = this[this.length - 1];

            if (prevTween.endFrame < endFrame)
            {
                if (prevTween.isTweenlessFrame)
                {
                    prevTween.endFrame = endFrame;
                    prevTween.duration = endFrame - prevTween.startFrame;
                }
                else
                {
                    this.addKeyframe(
                        this._currentProps,
                        prevTween.endFrame + 1,
                        endFrame - (prevTween.endFrame + 1),
                    );
                }
            }
        }
    }

    /**
     * Get the value for a property
     * @method PIXI.animate.Timeline#getPropFromShorthand
     * @param {string} prop
     */
    private getPropFromShorthand<P extends keyof TweenProps>(prop: P): TweenProps[P]
    {
        const target = this.target;

        switch (prop)
        {
            case 'x':
                return target.position.x as any;
            case 'y':
                return target.position.y as any;
            case 'sx':
                return target.scale.x as any;
            case 'sy':
                return target.scale.y as any;
            case 'kx':
                return target.skew.x as any;
            case 'ky':
                return target.skew.y as any;
            case 'r':
                return target.rotation as any;
            case 'a':
                return target.alpha as any;
            case 'v':
                return target.visible as any;
            case 'm':
                return target.mask as any;
                // case 't':
                //   return target.tint;
                // not sure if we'll actually handle graphics this way?
                // g: return null;
        }

        return null;
    }

    public destroy(): void
    {
        this._currentProps = null;
        this.length = 0;
    }
}
